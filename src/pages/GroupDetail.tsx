import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Layout from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, simplifyDebts } from '@/lib/balanceUtils';
import { Group, Profile, SplitType } from '@/types/database';
import { Plus, Users, Receipt, ArrowRight, Loader2, UserPlus, DollarSign } from 'lucide-react';

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    splitType: 'equal' as SplitType,
  });
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [settlementDialog, setSettlementDialog] = useState<{ open: boolean; debt: any }>({ open: false, debt: null });

  useEffect(() => {
    if (id) fetchGroupData();
  }, [id]);

  useEffect(() => {
    // Initialize all members as selected for equal split
    if (members.length > 0 && selectedParticipants.length === 0) {
      setSelectedParticipants(members.map(m => m.id));
    }
  }, [members]);

  const fetchGroupData = async () => {
    try {
      const [groupRes, membersRes, expensesRes, balancesRes, settlementsRes] = await Promise.all([
        supabase.from('groups').select('*').eq('id', id).single(),
        supabase.from('group_members').select('user_id, profiles(*)').eq('group_id', id),
        supabase.from('expenses').select('*, profiles:paid_by(*)').eq('group_id', id).order('created_at', { ascending: false }),
        supabase.from('balances').select('*').eq('group_id', id),
        supabase.from('settlements').select('*, payer:payer_id(*), payee:payee_id(*)').eq('group_id', id).order('created_at', { ascending: false }),
      ]);

      if (groupRes.error) throw groupRes.error;
      setGroup(groupRes.data);
      
      const memberProfiles = membersRes.data?.map((m: any) => m.profiles).filter(Boolean) || [];
      setMembers(memberProfiles);
      setExpenses(expensesRes.data || []);
      setBalances(balancesRes.data || []);
      setSettlements(settlementsRes.data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const addExpense = async () => {
    if (!newExpense.description || !newExpense.amount) {
      toast({ title: 'Error', description: 'Please fill all fields', variant: 'destructive' });
      return;
    }

    if (selectedParticipants.length === 0) {
      toast({ title: 'Error', description: 'Select at least one participant', variant: 'destructive' });
      return;
    }

    try {
      const amount = parseFloat(newExpense.amount);
      
      // Validate split type specific requirements
      if (newExpense.splitType === 'exact') {
        const totalExact = selectedParticipants.reduce((sum, id) => sum + (parseFloat(exactAmounts[id]) || 0), 0);
        if (Math.abs(totalExact - amount) > 0.01) {
          toast({ title: 'Error', description: `Exact amounts must sum to ${formatCurrency(amount)}. Current: ${formatCurrency(totalExact)}`, variant: 'destructive' });
          return;
        }
      }

      if (newExpense.splitType === 'percentage') {
        const totalPct = selectedParticipants.reduce((sum, id) => sum + (parseFloat(percentages[id]) || 0), 0);
        if (Math.abs(totalPct - 100) > 0.01) {
          toast({ title: 'Error', description: `Percentages must sum to 100%. Current: ${totalPct.toFixed(1)}%`, variant: 'destructive' });
          return;
        }
      }
      
      // Create expense
      const { data: expense, error: expError } = await supabase
        .from('expenses')
        .insert({
          group_id: id,
          description: newExpense.description,
          amount,
          paid_by: user!.id,
          split_type: newExpense.splitType,
        })
        .select()
        .single();

      if (expError) throw expError;

      // Create splits based on split type
      const splits = selectedParticipants.map(memberId => {
        let splitAmount = 0;
        let pct = null;

        if (newExpense.splitType === 'equal') {
          splitAmount = amount / selectedParticipants.length;
          pct = 100 / selectedParticipants.length;
        } else if (newExpense.splitType === 'exact') {
          splitAmount = parseFloat(exactAmounts[memberId]) || 0;
        } else if (newExpense.splitType === 'percentage') {
          pct = parseFloat(percentages[memberId]) || 0;
          splitAmount = (amount * pct) / 100;
        }

        return {
          expense_id: expense.id,
          user_id: memberId,
          amount: Math.round(splitAmount * 100) / 100,
          percentage: pct,
        };
      });

      await supabase.from('expense_splits').insert(splits);

      // Update balances
      for (const split of splits) {
        if (split.user_id !== user!.id) {
          // Check if balance exists
          const { data: existing } = await supabase
            .from('balances')
            .select('*')
            .eq('group_id', id)
            .eq('debtor_id', split.user_id)
            .eq('creditor_id', user!.id)
            .maybeSingle();

          if (existing) {
            await supabase
              .from('balances')
              .update({ amount: existing.amount + split.amount })
              .eq('id', existing.id);
          } else {
            await supabase.from('balances').insert({
              group_id: id,
              debtor_id: split.user_id,
              creditor_id: user!.id,
              amount: split.amount,
            });
          }
        }
      }

      toast({ title: 'Success', description: 'Expense added!' });
      setNewExpense({ description: '', amount: '', splitType: 'equal' });
      setSelectedParticipants(members.map(m => m.id));
      setExactAmounts({});
      setPercentages({});
      setExpenseDialogOpen(false);
      fetchGroupData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const addMember = async () => {
    if (!newMemberEmail) return;
    
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', newMemberEmail)
        .maybeSingle();

      if (!profile) {
        toast({ title: 'Error', description: 'User not found', variant: 'destructive' });
        return;
      }

      await supabase.from('group_members').insert({ group_id: id, user_id: profile.id });
      toast({ title: 'Success', description: 'Member added!' });
      setNewMemberEmail('');
      setMemberDialogOpen(false);
      fetchGroupData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const settleUp = async (debtorId: string, creditorId: string, amount: number) => {
    try {
      await supabase.from('settlements').insert({
        group_id: id,
        payer_id: debtorId,
        payee_id: creditorId,
        amount,
      });

      // Update balance
      const { data: balance } = await supabase
        .from('balances')
        .select('*')
        .eq('group_id', id)
        .eq('debtor_id', debtorId)
        .eq('creditor_id', creditorId)
        .maybeSingle();

      if (balance) {
        const newAmount = balance.amount - amount;
        if (newAmount <= 0.01) {
          await supabase.from('balances').delete().eq('id', balance.id);
        } else {
          await supabase.from('balances').update({ amount: newAmount }).eq('id', balance.id);
        }
      }

      toast({ title: 'Success', description: 'Settlement recorded successfully!' });
      setSettlementDialog({ open: false, debt: null });
      fetchGroupData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const toggleParticipant = (userId: string) => {
    if (selectedParticipants.includes(userId)) {
      setSelectedParticipants(selectedParticipants.filter(id => id !== userId));
    } else {
      setSelectedParticipants([...selectedParticipants, userId]);
    }
  };

  // Transform balances to include profile info from members
  const balancesWithProfiles = balances.map(b => ({
    ...b,
    debtor: members.find(m => m.id === b.debtor_id),
    creditor: members.find(m => m.id === b.creditor_id),
  }));
  
  const simplifiedDebts = simplifyDebts(balancesWithProfiles as any, members);

  if (loading) {
    return <Layout><div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">{group?.name}</h1>
            <p className="text-muted-foreground">{group?.description || `${members.length} members`}</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2"><UserPlus className="h-4 w-4" />Add Member</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Member</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input placeholder="friend@example.com" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} />
                  </div>
                  <Button onClick={addMember} className="w-full">Add Member</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="hero" className="gap-2"><Plus className="h-4 w-4" />Add Expense</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input placeholder="Dinner, groceries, etc." value={newExpense.description} onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input type="number" step="0.01" placeholder="0.00" value={newExpense.amount} onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Split Type</Label>
                    <Select value={newExpense.splitType} onValueChange={(v) => setNewExpense({ ...newExpense, splitType: v as SplitType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equal">Equal Split</SelectItem>
                        <SelectItem value="exact">Exact Amount</SelectItem>
                        <SelectItem value="percentage">Percentage</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Participants ({selectedParticipants.length} selected)</Label>
                    <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
                      {members.map(member => (
                        <div key={member.id} className="flex items-center justify-between p-2 hover:bg-secondary/50 rounded">
                          <div className="flex items-center gap-2">
                            <Checkbox 
                              checked={selectedParticipants.includes(member.id)}
                              onCheckedChange={() => toggleParticipant(member.id)}
                            />
                            <span className="text-sm">{member.full_name || member.email}</span>
                          </div>
                          
                          {selectedParticipants.includes(member.id) && newExpense.splitType === 'exact' && (
                            <Input 
                              type="number" 
                              step="0.01"
                              className="w-24 h-8"
                              placeholder="0.00"
                              value={exactAmounts[member.id] || ''}
                              onChange={(e) => setExactAmounts({ ...exactAmounts, [member.id]: e.target.value })}
                            />
                          )}
                          
                          {selectedParticipants.includes(member.id) && newExpense.splitType === 'percentage' && (
                            <div className="flex items-center gap-1">
                              <Input 
                                type="number" 
                                step="0.1"
                                className="w-20 h-8"
                                placeholder="0"
                                value={percentages[member.id] || ''}
                                onChange={(e) => setPercentages({ ...percentages, [member.id]: e.target.value })}
                              />
                              <span className="text-sm">%</span>
                            </div>
                          )}
                          
                          {selectedParticipants.includes(member.id) && newExpense.splitType === 'equal' && newExpense.amount && (
                            <span className="text-sm text-muted-foreground">
                              {formatCurrency(parseFloat(newExpense.amount) / selectedParticipants.length)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {newExpense.splitType === 'exact' && newExpense.amount && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Total: </span>
                      <span className={`font-medium ${Math.abs(selectedParticipants.reduce((sum, id) => sum + (parseFloat(exactAmounts[id]) || 0), 0) - parseFloat(newExpense.amount)) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(selectedParticipants.reduce((sum, id) => sum + (parseFloat(exactAmounts[id]) || 0), 0))}
                      </span>
                      <span className="text-muted-foreground"> / {formatCurrency(parseFloat(newExpense.amount))}</span>
                    </div>
                  )}

                  {newExpense.splitType === 'percentage' && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Total: </span>
                      <span className={`font-medium ${Math.abs(selectedParticipants.reduce((sum, id) => sum + (parseFloat(percentages[id]) || 0), 0) - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                        {selectedParticipants.reduce((sum, id) => sum + (parseFloat(percentages[id]) || 0), 0).toFixed(1)}%
                      </span>
                      <span className="text-muted-foreground"> / 100%</span>
                    </div>
                  )}

                  <Button onClick={addExpense} className="w-full">Add Expense</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="balances" className="space-y-4">
          <TabsList>
            <TabsTrigger value="balances">Balances</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="settlements">Settlements</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>

          <TabsContent value="balances" className="space-y-4">
            <Card className="border-0 shadow-md">
              <CardHeader><CardTitle>Simplified Debts</CardTitle></CardHeader>
              <CardContent>
                {simplifiedDebts.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">All settled up!</p>
                ) : (
                  <div className="space-y-3">
                    {simplifiedDebts.map((debt, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{debt.from.full_name || debt.from.email}</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{debt.to.full_name || debt.to.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive">{formatCurrency(debt.amount)}</Badge>
                          {debt.from.id === user?.id && (
                            <Button 
                              size="sm" 
                              variant="default" 
                              className="gap-1"
                              onClick={() => setSettlementDialog({ open: true, debt })}
                            >
                              <DollarSign className="h-3 w-3" />
                              Settle
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expenses" className="space-y-4">
            {expenses.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">No expenses yet</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {expenses.map((expense) => (
                  <Card key={expense.id} className="border-0 shadow-sm">
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10"><Receipt className="h-4 w-4 text-primary" /></div>
                        <div>
                          <p className="font-medium">{expense.description}</p>
                          <p className="text-sm text-muted-foreground">Paid by {(expense as any).profiles?.full_name || 'Unknown'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">{formatCurrency(Number(expense.amount))}</p>
                        <Badge variant="secondary">{expense.split_type}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="settlements" className="space-y-4">
            {settlements.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                  No settlements yet
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {settlements.map((settlement: any) => (
                  <Card key={settlement.id} className="border-0 shadow-sm">
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20">
                          <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {settlement.payer?.full_name || settlement.payer?.email || 'Unknown'}
                            <ArrowRight className="inline h-4 w-4 mx-1" />
                            {settlement.payee?.full_name || settlement.payee?.email || 'Unknown'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(settlement.created_at).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg text-green-600 dark:text-green-400">
                          {formatCurrency(Number(settlement.amount))}
                        </p>
                        <Badge variant="outline" className="border-green-600 text-green-600">
                          Settled
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="members">
            <Card className="border-0 shadow-md">
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
                      <Avatar>
                        <AvatarFallback className="bg-primary/10 text-primary">{(member.full_name || member.email).charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{member.full_name || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Settlement Confirmation Dialog */}
        <Dialog open={settlementDialog.open} onOpenChange={(open) => setSettlementDialog({ open, debt: null })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Settlement</DialogTitle>
              <CardDescription>
                Record a payment to settle this debt
              </CardDescription>
            </DialogHeader>
            {settlementDialog.debt && (
              <div className="space-y-4 py-4">
                <div className="p-4 bg-secondary/30 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">From</span>
                    <span className="font-medium">{settlementDialog.debt.from.full_name || settlementDialog.debt.from.email}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">To</span>
                    <span className="font-medium">{settlementDialog.debt.to.full_name || settlementDialog.debt.to.email}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Amount</span>
                    <span className="text-xl font-bold text-primary">{formatCurrency(settlementDialog.debt.amount)}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  This will record that {settlementDialog.debt.from.full_name || settlementDialog.debt.from.email} has paid {formatCurrency(settlementDialog.debt.amount)} to {settlementDialog.debt.to.full_name || settlementDialog.debt.to.email}.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSettlementDialog({ open: false, debt: null })}>
                Cancel
              </Button>
              <Button 
                onClick={() => settlementDialog.debt && settleUp(settlementDialog.debt.from.id, settlementDialog.debt.to.id, settlementDialog.debt.amount)}
              >
                Confirm Settlement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
