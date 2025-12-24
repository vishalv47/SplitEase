import { supabase } from '@/integrations/supabase/client';
import { Balance } from '@/types/database';
import { RepositoryResult } from './types';

export interface BalanceEntry {
  id: string;
  groupId: string;
  debtorId: string;
  creditorId: string;
  amount: number;
  updatedAt: string;
}

export const balanceRepository = {
  /**
   * Get all balances for a group
   */
  async getByGroupId(groupId: string): Promise<RepositoryResult<Balance[]>> {
    const { data, error } = await supabase
      .from('balances')
      .select('*')
      .eq('group_id', groupId)
      .gt('amount', 0);

    return { data: data as Balance[] | null, error };
  },

  /**
   * Get balances for a specific user in a group
   */
  async getByUserInGroup(groupId: string, userId: string): Promise<RepositoryResult<Balance[]>> {
    const { data, error } = await supabase
      .from('balances')
      .select('*')
      .eq('group_id', groupId)
      .or(`debtor_id.eq.${userId},creditor_id.eq.${userId}`)
      .gt('amount', 0);

    return { data: data as Balance[] | null, error };
  },

  /**
   * Get all balances where user owes money (across all groups)
   */
  async getDebts(userId: string): Promise<RepositoryResult<Balance[]>> {
    const { data, error } = await supabase
      .from('balances')
      .select('*')
      .eq('debtor_id', userId)
      .gt('amount', 0);

    return { data: data as Balance[] | null, error };
  },

  /**
   * Get all balances where user is owed money (across all groups)
   */
  async getCredits(userId: string): Promise<RepositoryResult<Balance[]>> {
    const { data, error } = await supabase
      .from('balances')
      .select('*')
      .eq('creditor_id', userId)
      .gt('amount', 0);

    return { data: data as Balance[] | null, error };
  },

  /**
   * Get or create a balance between two users in a group
   */
  async getOrCreate(
    groupId: string,
    debtorId: string,
    creditorId: string
  ): Promise<RepositoryResult<Balance>> {
    // First try to get existing balance
    const { data: existing } = await supabase
      .from('balances')
      .select('*')
      .eq('group_id', groupId)
      .eq('debtor_id', debtorId)
      .eq('creditor_id', creditorId)
      .single();

    if (existing) {
      return { data: existing as Balance, error: null };
    }

    // Create new balance
    const { data, error } = await supabase
      .from('balances')
      .insert({
        group_id: groupId,
        debtor_id: debtorId,
        creditor_id: creditorId,
        amount: 0,
      })
      .select()
      .single();

    return { data: data as Balance | null, error };
  },

  /**
   * Update a balance amount
   */
  async updateAmount(balanceId: string, amount: number): Promise<RepositoryResult<Balance>> {
    const { data, error } = await supabase
      .from('balances')
      .update({ amount, updated_at: new Date().toISOString() })
      .eq('id', balanceId)
      .select()
      .single();

    return { data: data as Balance | null, error };
  },

  /**
   * Upsert balance (create or update)
   */
  async upsert(
    groupId: string,
    debtorId: string,
    creditorId: string,
    amount: number
  ): Promise<RepositoryResult<Balance>> {
    const { data, error } = await supabase
      .from('balances')
      .upsert(
        {
          group_id: groupId,
          debtor_id: debtorId,
          creditor_id: creditorId,
          amount,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'group_id,debtor_id,creditor_id',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    return { data: data as Balance | null, error };
  },
};
