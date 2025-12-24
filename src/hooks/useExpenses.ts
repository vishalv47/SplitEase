import { useState, useEffect, useCallback } from 'react';
import { expenseService, AddExpenseInput } from '@/services';
import { SplitType } from '@/types/database';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface ExpenseData {
  id: string;
  description: string;
  amount: number;
  paid_by: string;
  split_type: string;
  created_at: string;
  payer_profile?: {
    id: string;
    email: string;
    full_name: string | null;
  };
}

export function useExpenses(groupId: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<ExpenseData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExpenses = useCallback(async () => {
    if (!user || !groupId) return;

    setLoading(true);
    const result = await expenseService.getGroupExpenses(groupId, user.id);

    if (result.success && result.data) {
      setExpenses(result.data);
    } else if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
    setLoading(false);
  }, [user, groupId, toast]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const addExpense = async (
    description: string,
    amount: number,
    splitType: SplitType,
    participantIds: string[],
    customAmounts?: Record<string, number>,
    customPercentages?: Record<string, number>
  ) => {
    if (!user) return null;

    const input: AddExpenseInput = {
      groupId,
      description,
      amount,
      paidBy: user.id,
      splitType,
      participantIds,
      customAmounts,
      customPercentages,
    };

    const result = await expenseService.addExpense(input);

    if (result.success && result.data) {
      await fetchExpenses();
      toast({ title: 'Success', description: 'Expense added successfully' });
      return result.data;
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to add expense', variant: 'destructive' });
      return null;
    }
  };

  const deleteExpense = async (expenseId: string) => {
    if (!user) return false;

    const result = await expenseService.deleteExpense(expenseId, user.id);

    if (result.success) {
      await fetchExpenses();
      toast({ title: 'Success', description: 'Expense deleted successfully' });
      return true;
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to delete expense', variant: 'destructive' });
      return false;
    }
  };

  return {
    expenses,
    loading,
    addExpense,
    deleteExpense,
    refreshExpenses: fetchExpenses,
  };
}
