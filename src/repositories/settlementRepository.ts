import { supabase } from '@/integrations/supabase/client';
import { Settlement, Profile } from '@/types/database';
import { RepositoryResult } from './types';

export interface SettlementWithProfiles extends Settlement {
  payer_profile?: Profile;
  payee_profile?: Profile;
}

export const settlementRepository = {
  /**
   * Create a new settlement
   */
  async create(
    groupId: string,
    payerId: string,
    payeeId: string,
    amount: number
  ): Promise<RepositoryResult<Settlement>> {
    const { data, error } = await supabase
      .from('settlements')
      .insert({
        group_id: groupId,
        payer_id: payerId,
        payee_id: payeeId,
        amount,
      })
      .select()
      .single();

    return { data: data as Settlement | null, error };
  },

  /**
   * Get all settlements for a group
   */
  async getByGroupId(groupId: string): Promise<RepositoryResult<Settlement[]>> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    return { data: data as Settlement[] | null, error };
  },

  /**
   * Get settlements involving a specific user
   */
  async getByUserId(userId: string): Promise<RepositoryResult<Settlement[]>> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .or(`payer_id.eq.${userId},payee_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    return { data: data as Settlement[] | null, error };
  },

  /**
   * Get a single settlement by ID
   */
  async getById(settlementId: string): Promise<RepositoryResult<Settlement>> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('id', settlementId)
      .single();

    return { data: data as Settlement | null, error };
  },
};
