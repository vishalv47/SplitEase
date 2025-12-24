import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Layout from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, simplifyDebts } from '@/lib/balanceUtils';
import { Group, Profile, SplitType } from '@/types/database';
import { Plus, Users, Receipt, ArrowRight, Loader2, UserPlus } from 'lucide-react';

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    splitType: 'equal' as SplitType,
  });

  useEffect(() => {
    if (id) fetchGroupData();
  }, [id]);

  const fetchGroupData = async () => {
    try {
      const [groupRes, membersRes, expensesRes, balancesRes] = await Promise.all([
        supabase.from('groups').select('*').eq('id', id).single(),
        supabase.from('group_members').select('user_id, profiles(*)').eq('group_id', id),
        supabase.from('expenses').select('*, profiles:paid_by(*)').eq('group_id', id).order('created_at', { ascending: false }),
        supabase.from('balances').select('*').eq('group_id', id),
      ]);

      if (groupRes.error) throw groupRes.error;
      setGroup(groupRes.data);
      
      const memberProfiles = membersRes.data?.map((m: any) => m.profiles).filter(Boolean) || [];
      setMembers(memberProfiles);
      setExpenses(expensesRes.data || []);
      setBalances(balancesRes.data || []);
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

    try {
      const amount = parseFloat(newExpense.amount);
      
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

      // Create splits for all members (equal split)
      const splitAmount = amount / members.length;
      const splits = members.map(m => ({
        expense_id: expense.id,
        user_id: m.id,
        amount: splitAmount,
        percentage: 100 / members.length,
      }));

      await supabase.from('expense_splits').insert(splits);

      // Update balances
      for (const member of members) {
        if (member.id !== user!.id) {
          // Check if balance exists
          const { data: existing } = await supabase
            .from('balances')
            .select('*')
            .eq('group_id', id)
            .eq('debtor_id', member.id)
            .eq('creditor_id', user!.id)
            .maybeSingle();

          if (existing) {
            await supabase
              .from('balances')
              .update({ amount: existing.amount + splitAmount })
              .eq('id', existing.id);
          } else {
            await supabase.from('balances').insert({
              group_id: id,
              debtor_id: member.id,
              creditor_id: user!.id,
              amount: splitAmount,
            });
          }
        }
      }

      toast({ title: 'Success', description: 'Expense added!' });
      setNewExpense({ description: '', amount: '', splitType: 'equal' });
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
        if (newAmount <= 0) {
          await supabase.from('balances').delete().eq('id', balance.id);
        } else {
          await supabase.from('balances').update({ amount: newAmount }).eq('id', balance.id);
        }
      }

      toast({ title: 'Success', description: 'Settlement recorded!' });
      fetchGroupData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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
              <DialogContent>
                <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input placeholder="Dinner, groceries, etc." value={newExpense.description} onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input type="number" placeholder="0.00" value={newExpense.amount} onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })} />
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
                            <Button size="sm" variant="success" onClick={() => settleUp(debt.from.id, debt.to.id, debt.amount)}>
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
      </div>
    </Layout>
  );
}
