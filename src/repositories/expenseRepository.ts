import { supabase } from '@/integrations/supabase/client';
import { Expense, ExpenseSplit, SplitType } from '@/types/database';
import { RepositoryResult } from './types';

export interface ExpenseWithDetails extends Expense {
  payer_profile?: {
    id: string;
    email: string;
    full_name: string | null;
  };
}

export interface CreateExpenseInput {
  groupId: string;
  description: string;
  amount: number;
  paidBy: string;
  splitType: SplitType;
  splits: {
    userId: string;
    amount: number;
    percentage?: number;
  }[];
}

export const expenseRepository = {
  /**
   * Create a new expense with splits
   */
  async create(input: CreateExpenseInput): Promise<RepositoryResult<Expense>> {
    // Insert expense
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert({
        group_id: input.groupId,
        description: input.description,
        amount: input.amount,
        paid_by: input.paidBy,
        split_type: input.splitType,
      })
      .select()
      .single();

    if (expenseError || !expense) {
      return { data: null, error: expenseError };
    }

    // Insert splits
    const splitsToInsert = input.splits.map((split) => ({
      expense_id: expense.id,
      user_id: split.userId,
      amount: split.amount,
      percentage: split.percentage ?? null,
    }));

    const { error: splitsError } = await supabase
      .from('expense_splits')
      .insert(splitsToInsert);

    if (splitsError) {
      // Rollback expense if splits fail
      await supabase.from('expenses').delete().eq('id', expense.id);
      return { data: null, error: splitsError };
    }

    return { data: expense as Expense, error: null };
  },

  /**
   * Get an expense by ID
   */
  async getById(expenseId: string): Promise<RepositoryResult<ExpenseWithDetails>> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, profiles:paid_by(id, email, full_name)')
      .eq('id', expenseId)
      .single();

    if (error) return { data: null, error };

    return {
      data: {
        ...data,
        split_type: data.split_type as SplitType,
        payer_profile: (data as any).profiles,
      },
      error: null,
    };
  },

  /**
   * Get all expenses for a group
   */
  async getByGroupId(groupId: string): Promise<RepositoryResult<ExpenseWithDetails[]>> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, profiles:paid_by(id, email, full_name)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (error) return { data: null, error };

    const expenses = data?.map((exp) => ({
      ...exp,
      split_type: exp.split_type as SplitType,
      payer_profile: (exp as any).profiles,
    })) ?? [];

    return { data: expenses, error: null };
  },

  /**
   * Get splits for an expense
   */
  async getSplits(expenseId: string): Promise<RepositoryResult<ExpenseSplit[]>> {
    const { data, error } = await supabase
      .from('expense_splits')
      .select('*, profiles:user_id(id, email, full_name)')
      .eq('expense_id', expenseId);

    return { data: data as ExpenseSplit[] | null, error };
  },

  /**
   * Delete an expense and its splits
   */
  async delete(expenseId: string): Promise<RepositoryResult<null>> {
    // Splits are deleted via cascade
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId);

    return { data: null, error };
  },

  /**
   * Update an expense
   */
  async update(expenseId: string, updates: Partial<Expense>): Promise<RepositoryResult<Expense>> {
    const { data, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', expenseId)
      .select()
      .single();

    return { data: data as Expense | null, error };
  },
};
