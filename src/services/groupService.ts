import { groupRepository } from '@/repositories';
import { profileRepository } from '@/repositories';
import { Group, Profile } from '@/types/database';
import { ServiceResult, successResult, errorResult } from './types';

export interface CreateGroupInput {
  name: string;
  description?: string;
  createdBy: string;
}

export interface GroupWithMemberCount extends Group {
  memberCount: number;
}

export const groupService = {
  /**
   * Create a new group and add the creator as a member
   */
  async createGroup(input: CreateGroupInput): Promise<ServiceResult<Group>> {
    const { name, description, createdBy } = input;

    // Validation
    if (!name || name.trim().length === 0) {
      return errorResult('Group name is required');
    }

    if (name.length > 100) {
      return errorResult('Group name must be less than 100 characters');
    }

    // Create group
    const { data: group, error: groupError } = await groupRepository.create(
      name.trim(),
      description?.trim() || null,
      createdBy
    );

    if (groupError || !group) {
      return errorResult(groupError?.message || 'Failed to create group');
    }

    // Add creator as first member
    const { error: memberError } = await groupRepository.addMember(group.id, createdBy);
    if (memberError) {
      // Rollback group creation
      await groupRepository.delete(group.id);
      return errorResult('Failed to add creator as member');
    }

    return successResult(group);
  },

  /**
   * Get group details with members
   */
  async getGroupDetails(groupId: string, userId: string): Promise<ServiceResult<{ group: Group; members: Profile[] }>> {
    // Verify user is a member
    const isMember = await groupRepository.isMember(groupId, userId);
    if (!isMember) {
      return errorResult('User is not a member of this group');
    }

    const [groupResult, membersResult] = await Promise.all([
      groupRepository.getById(groupId),
      groupRepository.getMembers(groupId),
    ]);

    if (groupResult.error || !groupResult.data) {
      return errorResult('Group not found');
    }

    return successResult({
      group: groupResult.data,
      members: membersResult.data || [],
    });
  },

  /**
   * Get all groups for a user
   */
  async getUserGroups(userId: string): Promise<ServiceResult<Group[]>> {
    const { data, error } = await groupRepository.getByUserId(userId);
    
    if (error) {
      return errorResult(error.message);
    }

    return successResult(data || []);
  },

  /**
   * Add a member to a group by email
   */
  async addMemberByEmail(groupId: string, email: string, requestedBy: string): Promise<ServiceResult<Profile>> {
    // Verify requester is the group creator
    const { data: group } = await groupRepository.getById(groupId);
    if (!group) {
      return errorResult('Group not found');
    }

    if (group.created_by !== requestedBy) {
      return errorResult('Only the group creator can add members');
    }

    // Find user by email
    const { data: profile, error: profileError } = await profileRepository.getByEmail(email.trim().toLowerCase());
    if (profileError || !profile) {
      return errorResult('User not found with this email');
    }

    // Check if already a member
    const isMember = await groupRepository.isMember(groupId, profile.id);
    if (isMember) {
      return errorResult('User is already a member of this group');
    }

    // Add member
    const { error: addError } = await groupRepository.addMember(groupId, profile.id);
    if (addError) {
      return errorResult(addError.message);
    }

    return successResult(profile);
  },

  /**
   * Remove a member from a group
   */
  async removeMember(groupId: string, memberUserId: string, requestedBy: string): Promise<ServiceResult<boolean>> {
    const { data: group } = await groupRepository.getById(groupId);
    if (!group) {
      return errorResult('Group not found');
    }

    // Only creator can remove members (except themselves)
    if (group.created_by !== requestedBy && memberUserId !== requestedBy) {
      return errorResult('Only the group creator can remove members');
    }

    // Creator cannot be removed
    if (memberUserId === group.created_by) {
      return errorResult('Group creator cannot be removed');
    }

    const { error } = await groupRepository.removeMember(groupId, memberUserId);
    if (error) {
      return errorResult(error.message);
    }

    return successResult(true);
  },

  /**
   * Delete a group
   */
  async deleteGroup(groupId: string, userId: string): Promise<ServiceResult<boolean>> {
    const { data: group } = await groupRepository.getById(groupId);
    if (!group) {
      return errorResult('Group not found');
    }

    if (group.created_by !== userId) {
      return errorResult('Only the group creator can delete the group');
    }

    const { error } = await groupRepository.delete(groupId);
    if (error) {
      return errorResult(error.message);
    }

    return successResult(true);
  },
};
