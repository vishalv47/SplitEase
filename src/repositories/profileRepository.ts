import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/types/database';
import { RepositoryResult } from './types';

export const profileRepository = {
  /**
   * Get a profile by user ID
   */
  async getById(userId: string): Promise<RepositoryResult<Profile>> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    return { data, error };
  },

  /**
   * Get a profile by email
   */
  async getByEmail(email: string): Promise<RepositoryResult<Profile>> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    return { data, error };
  },

  /**
   * Get all profiles
   */
  async getAll(): Promise<RepositoryResult<Profile[]>> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name');

    return { data, error };
  },

  /**
   * Update a profile
   */
  async update(userId: string, updates: Partial<Profile>): Promise<RepositoryResult<Profile>> {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    return { data, error };
  },
};
