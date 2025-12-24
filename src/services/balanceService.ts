import { balanceRepository, settlementRepository, groupRepository } from '@/repositories';
import { Balance, Settlement, Profile } from '@/types/database';
import { ServiceResult, successResult, errorResult } from './types';

export interface UserBalanceSummary {
  totalOwed: number;      // Amount others owe to user
  totalOwing: number;     // Amount user owes to others
  netBalance: number;     // totalOwed - totalOwing
}

export interface DetailedBalance {
  balance: Balance;
  otherUser: Profile;
  isDebtor: boolean;
}

export const balanceService = {
  /**
   * Get user's balance summary across all groups
   */
  async getUserBalanceSummary(userId: string): Promise<ServiceResult<UserBalanceSummary>> {
    const [debtsResult, creditsResult] = await Promise.all([
      balanceRepository.getDebts(userId),
      balanceRepository.getCredits(userId),
    ]);

    const totalOwing = debtsResult.data?.reduce((sum, b) => sum + b.amount, 0) || 0;
    const totalOwed = creditsResult.data?.reduce((sum, b) => sum + b.amount, 0) || 0;

    return successResult({
      totalOwed,
      totalOwing,
      netBalance: totalOwed - totalOwing,
    });
  },

  /**
   * Get balances for a specific group
   */
  async getGroupBalances(groupId: string, userId: string): Promise<ServiceResult<Balance[]>> {
    const isMember = await groupRepository.isMember(groupId, userId);
    if (!isMember) {
      return errorResult('User is not a member of this group');
    }

    const { data, error } = await balanceRepository.getByGroupId(groupId);
    if (error) {
      return errorResult(error.message);
    }

    return successResult(data || []);
  },

  /**
   * Settle a balance between two users
   * 
   * Business logic:
   * 1. Validate the settlement amount doesn't exceed the debt
   * 2. Create settlement record
   * 3. Reduce the balance by the settlement amount
   */
  async settleBalance(
    groupId: string,
    payerId: string,   // Person paying (the debtor)
    payeeId: string,   // Person receiving (the creditor)
    amount: number
  ): Promise<ServiceResult<Settlement>> {
    // Validation
    if (amount <= 0) {
      return errorResult('Settlement amount must be positive');
    }

    // Get current balance (payer owes payee)
    const { data: balances } = await balanceRepository.getByGroupId(groupId);
    const balance = balances?.find(
      (b) => b.debtor_id === payerId && b.creditor_id === payeeId
    );

    if (!balance || balance.amount <= 0) {
      return errorResult('No outstanding balance to settle');
    }

    if (amount > balance.amount) {
      return errorResult(`Settlement amount cannot exceed the outstanding balance of $${balance.amount.toFixed(2)}`);
    }

    // Create settlement record
    const { data: settlement, error: settlementError } = await settlementRepository.create(
      groupId,
      payerId,
      payeeId,
      amount
    );

    if (settlementError || !settlement) {
      return errorResult(settlementError?.message || 'Failed to create settlement');
    }

    // Update balance
    const newAmount = balance.amount - amount;
    const { error: updateError } = await balanceRepository.updateAmount(balance.id, newAmount);

    if (updateError) {
      return errorResult('Settlement recorded but balance update failed');
    }

    return successResult(settlement);
  },

  /**
   * Get settlement history for a group
   */
  async getGroupSettlements(groupId: string, userId: string): Promise<ServiceResult<Settlement[]>> {
    const isMember = await groupRepository.isMember(groupId, userId);
    if (!isMember) {
      return errorResult('User is not a member of this group');
    }

    const { data, error } = await settlementRepository.getByGroupId(groupId);
    if (error) {
      return errorResult(error.message);
    }

    return successResult(data || []);
  },

  /**
   * Get user's settlement history
   */
  async getUserSettlements(userId: string): Promise<ServiceResult<Settlement[]>> {
    const { data, error } = await settlementRepository.getByUserId(userId);
    if (error) {
      return errorResult(error.message);
    }

    return successResult(data || []);
  },

  /**
   * Calculate simplified debts for a group
   * Minimizes the number of transactions needed to settle all debts
   */
  async getSimplifiedDebts(groupId: string, userId: string): Promise<ServiceResult<{ from: string; to: string; amount: number }[]>> {
    const isMember = await groupRepository.isMember(groupId, userId);
    if (!isMember) {
      return errorResult('User is not a member of this group');
    }

    const { data: balances } = await balanceRepository.getByGroupId(groupId);
    if (!balances || balances.length === 0) {
      return successResult([]);
    }

    // Calculate net balance for each user
    const netBalances: Record<string, number> = {};
    
    for (const balance of balances) {
      netBalances[balance.debtor_id] = (netBalances[balance.debtor_id] || 0) - balance.amount;
      netBalances[balance.creditor_id] = (netBalances[balance.creditor_id] || 0) + balance.amount;
    }

    // Separate creditors and debtors
    const creditors: { id: string; amount: number }[] = [];
    const debtors: { id: string; amount: number }[] = [];

    for (const [userId, amount] of Object.entries(netBalances)) {
      if (amount > 0.01) {
        creditors.push({ id: userId, amount });
      } else if (amount < -0.01) {
        debtors.push({ id: userId, amount: -amount });
      }
    }

    // Sort by amount (descending)
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    // Match debtors with creditors
    const simplifiedDebts: { from: string; to: string; amount: number }[] = [];
    
    while (creditors.length > 0 && debtors.length > 0) {
      const creditor = creditors[0];
      const debtor = debtors[0];
      
      const settleAmount = Math.min(creditor.amount, debtor.amount);
      
      if (settleAmount > 0.01) {
        simplifiedDebts.push({
          from: debtor.id,
          to: creditor.id,
          amount: Math.round(settleAmount * 100) / 100,
        });
      }

      creditor.amount -= settleAmount;
      debtor.amount -= settleAmount;

      if (creditor.amount < 0.01) creditors.shift();
      if (debtor.amount < 0.01) debtors.shift();
    }

    return successResult(simplifiedDebts);
  },
};
