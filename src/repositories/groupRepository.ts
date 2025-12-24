import { supabase } from '@/integrations/supabase/client';
import { Group, GroupMember, Profile } from '@/types/database';
import { RepositoryResult } from './types';

export interface GroupWithMembers extends Group {
  members: Profile[];
}

export const groupRepository = {
  /**
   * Create a new group
   */
  async create(name: string, description: string | null, createdBy: string): Promise<RepositoryResult<Group>> {
    const { data, error } = await supabase
      .from('groups')
      .insert({ name, description, created_by: createdBy })
      .select()
      .single();

    return { data, error };
  },

  /**
   * Get a group by ID
   */
  async getById(groupId: string): Promise<RepositoryResult<Group>> {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single();

    return { data, error };
  },

  /**
   * Get all groups for a user
   */
  async getByUserId(userId: string): Promise<RepositoryResult<Group[]>> {
    const { data, error } = await supabase
      .from('groups')
      .select(`
        *,
        group_members!inner(user_id)
      `)
      .eq('group_members.user_id', userId)
      .order('created_at', { ascending: false });

    return { data, error };
  },

  /**
   * Update a group
   */
  async update(groupId: string, updates: Partial<Group>): Promise<RepositoryResult<Group>> {
    const { data, error } = await supabase
      .from('groups')
      .update(updates)
      .eq('id', groupId)
      .select()
      .single();

    return { data, error };
  },

  /**
   * Delete a group
   */
  async delete(groupId: string): Promise<RepositoryResult<null>> {
    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', groupId);

    return { data: null, error };
  },

  /**
   * Add a member to a group
   */
  async addMember(groupId: string, userId: string): Promise<RepositoryResult<GroupMember>> {
    const { data, error } = await supabase
      .from('group_members')
      .insert({ group_id: groupId, user_id: userId })
      .select()
      .single();

    return { data, error };
  },

  /**
   * Remove a member from a group
   */
  async removeMember(groupId: string, userId: string): Promise<RepositoryResult<null>> {
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    return { data: null, error };
  },

  /**
   * Get all members of a group with their profiles
   */
  async getMembers(groupId: string): Promise<RepositoryResult<Profile[]>> {
    const { data, error } = await supabase
      .from('group_members')
      .select('profiles(*)')
      .eq('group_id', groupId);

    if (error) return { data: null, error };

    const profiles = data
      ?.map((m: any) => m.profiles)
      .filter((p: Profile | null): p is Profile => p !== null) ?? [];

    return { data: profiles, error: null };
  },

  /**
   * Check if a user is a member of a group
   */
  async isMember(groupId: string, userId: string): Promise<boolean> {
    const { data } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    return !!data;
  },
};
