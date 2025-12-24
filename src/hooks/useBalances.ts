import { useState, useEffect, useCallback } from 'react';
import { balanceService, UserBalanceSummary } from '@/services';
import { Balance, Settlement } from '@/types/database';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export function useUserBalanceSummary() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [summary, setSummary] = useState<UserBalanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    const result = await balanceService.getUserBalanceSummary(user.id);

    if (result.success && result.data) {
      setSummary(result.data);
    } else if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summary,
    loading,
    refreshSummary: fetchSummary,
  };
}

export function useGroupBalances(groupId: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [simplifiedDebts, setSimplifiedDebts] = useState<{ from: string; to: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBalances = useCallback(async () => {
    if (!user || !groupId) return;

    setLoading(true);
    
    const [balancesResult, settlementsResult, simplifiedResult] = await Promise.all([
      balanceService.getGroupBalances(groupId, user.id),
      balanceService.getGroupSettlements(groupId, user.id),
      balanceService.getSimplifiedDebts(groupId, user.id),
    ]);

    if (balancesResult.success && balancesResult.data) {
      setBalances(balancesResult.data);
    }
    if (settlementsResult.success && settlementsResult.data) {
      setSettlements(settlementsResult.data);
    }
    if (simplifiedResult.success && simplifiedResult.data) {
      setSimplifiedDebts(simplifiedResult.data);
    }
    
    setLoading(false);
  }, [user, groupId]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const settleBalance = async (payeeId: string, amount: number) => {
    if (!user) return null;

    const result = await balanceService.settleBalance(groupId, user.id, payeeId, amount);

    if (result.success && result.data) {
      await fetchBalances();
      toast({ title: 'Success', description: 'Settlement recorded successfully' });
      return result.data;
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to record settlement', variant: 'destructive' });
      return null;
    }
  };

  return {
    balances,
    settlements,
    simplifiedDebts,
    loading,
    settleBalance,
    refreshBalances: fetchBalances,
  };
}
