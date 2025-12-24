import { useState, useEffect, useCallback } from 'react';
import { groupService } from '@/services';
import { Group, Profile } from '@/types/database';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export function useGroups() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    const result = await groupService.getUserGroups(user.id);
    
    if (result.success && result.data) {
      setGroups(result.data);
    } else if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const createGroup = async (name: string, description?: string) => {
    if (!user) return null;

    const result = await groupService.createGroup({
      name,
      description,
      createdBy: user.id,
    });

    if (result.success && result.data) {
      await fetchGroups();
      toast({ title: 'Success', description: 'Group created successfully' });
      return result.data;
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to create group', variant: 'destructive' });
      return null;
    }
  };

  const deleteGroup = async (groupId: string) => {
    if (!user) return false;

    const result = await groupService.deleteGroup(groupId, user.id);

    if (result.success) {
      await fetchGroups();
      toast({ title: 'Success', description: 'Group deleted successfully' });
      return true;
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to delete group', variant: 'destructive' });
      return false;
    }
  };

  return {
    groups,
    loading,
    createGroup,
    deleteGroup,
    refreshGroups: fetchGroups,
  };
}

export function useGroupDetails(groupId: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDetails = useCallback(async () => {
    if (!user || !groupId) return;

    setLoading(true);
    const result = await groupService.getGroupDetails(groupId, user.id);

    if (result.success && result.data) {
      setGroup(result.data.group);
      setMembers(result.data.members);
    } else if (result.error) {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
    setLoading(false);
  }, [user, groupId, toast]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const addMember = async (email: string) => {
    if (!user) return null;

    const result = await groupService.addMemberByEmail(groupId, email, user.id);

    if (result.success && result.data) {
      await fetchDetails();
      toast({ title: 'Success', description: 'Member added successfully' });
      return result.data;
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to add member', variant: 'destructive' });
      return null;
    }
  };

  const removeMember = async (memberUserId: string) => {
    if (!user) return false;

    const result = await groupService.removeMember(groupId, memberUserId, user.id);

    if (result.success) {
      await fetchDetails();
      toast({ title: 'Success', description: 'Member removed successfully' });
      return true;
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to remove member', variant: 'destructive' });
      return false;
    }
  };

  return {
    group,
    members,
    loading,
    addMember,
    removeMember,
    refreshDetails: fetchDetails,
  };
}
