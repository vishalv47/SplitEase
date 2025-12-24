import { groupRepository, expenseRepository, balanceRepository } from '@/repositories';
import { SplitType } from '@/types/database';
import { validateSplit, calculateSplitAmounts } from '@/lib/balanceUtils';
import { ServiceResult, successResult, errorResult } from './types';

export interface AddExpenseInput {
  groupId: string;
  description: string;
  amount: number;
  paidBy: string;
  splitType: SplitType;
  participantIds: string[];
  customAmounts?: Record<string, number>;
  customPercentages?: Record<string, number>;
}

export interface ExpenseServiceResult {
  expenseId: string;
  balancesUpdated: boolean;
}

export const expenseService = {
  /**
   * Add a new expense with automatic balance calculation
   * 
   * Business logic:
   * 1. Validate user is a group member
   * 2. Validate split configuration
   * 3. Calculate individual split amounts
   * 4. Create expense and splits
   * 5. Update balances between payer and participants
   */
  async addExpense(input: AddExpenseInput): Promise<ServiceResult<ExpenseServiceResult>> {
    const { groupId, description, amount, paidBy, splitType, participantIds, customAmounts, customPercentages } = input;

    // Validation: Check if payer is a group member
    const isMember = await groupRepository.isMember(groupId, paidBy);
    if (!isMember) {
      return errorResult('Payer must be a member of the group');
    }

    // Validation: Check if all participants are group members
    for (const participantId of participantIds) {
      const participantIsMember = await groupRepository.isMember(groupId, participantId);
      if (!participantIsMember) {
        return errorResult(`Participant ${participantId} is not a member of the group`);
      }
    }

    // Convert Record to Map for utility functions
    const customAmountsMap = customAmounts ? new Map(Object.entries(customAmounts).map(([k, v]) => [k, v])) : undefined;
    const customPercentagesMap = customPercentages ? new Map(Object.entries(customPercentages).map(([k, v]) => [k, v])) : undefined;

    // Validation: Validate split configuration
    const validation = validateSplit(amount, splitType, splitType === 'exact' ? customAmountsMap : customPercentagesMap);
    if (!validation.valid) {
      return errorResult(validation.error || 'Invalid split configuration');
    }

    // Calculate split amounts
    const splitAmountsMap = calculateSplitAmounts(
      amount,
      participantIds,
      splitType,
      splitType === 'percentage' ? customPercentagesMap : customAmountsMap
    );

    // Prepare splits for insertion
    const splits = participantIds.map((userId) => ({
      userId,
      amount: splitAmountsMap.get(userId) || amount / participantIds.length,
      percentage: splitType === 'percentage' ? customPercentages?.[userId] : undefined,
    }));

    // Create expense with splits
    const { data: expense, error: expenseError } = await expenseRepository.create({
      groupId,
      description,
      amount,
      paidBy,
      splitType,
      splits,
    });

    if (expenseError || !expense) {
      return errorResult(expenseError?.message || 'Failed to create expense');
    }

    // Update balances
    try {
      await this.updateBalancesForExpense(groupId, paidBy, splits);
      return successResult({ expenseId: expense.id, balancesUpdated: true });
    } catch (error) {
      // Expense was created but balance update failed
      return successResult({ expenseId: expense.id, balancesUpdated: false });
    }
  },

  /**
   * Update balances after adding an expense
   * 
   * For each participant (except the payer):
   * - participant owes payer their split amount
   */
  async updateBalancesForExpense(
    groupId: string,
    payerId: string,
    splits: { userId: string; amount: number }[]
  ): Promise<void> {
    for (const split of splits) {
      if (split.userId === payerId) continue; // Payer doesn't owe themselves

      // Get current balance between debtor and creditor
      const { data: existingBalance } = await balanceRepository.getOrCreate(
        groupId,
        split.userId, // debtor (participant who owes)
        payerId        // creditor (payer who paid)
      );

      if (existingBalance) {
        const newAmount = existingBalance.amount + split.amount;
        await balanceRepository.updateAmount(existingBalance.id, newAmount);
      }
    }

    // Simplify balances by checking for reverse debts
    await this.simplifyGroupBalances(groupId);
  },

  /**
   * Simplify balances within a group
   * 
   * If A owes B $10 and B owes A $3:
   * - Result: A owes B $7, B owes A $0
   */
  async simplifyGroupBalances(groupId: string): Promise<void> {
    const { data: balances } = await balanceRepository.getByGroupId(groupId);
    if (!balances) return;

    // Find pairs and net them out
    const processed = new Set<string>();

    for (const balance of balances) {
      const pairKey = [balance.debtor_id, balance.creditor_id].sort().join('-');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      // Find reverse balance
      const reverseBalance = balances.find(
        (b) => b.debtor_id === balance.creditor_id && b.creditor_id === balance.debtor_id
      );

      if (reverseBalance && reverseBalance.amount > 0 && balance.amount > 0) {
        // Net out the balances
        if (balance.amount > reverseBalance.amount) {
          await balanceRepository.updateAmount(balance.id, balance.amount - reverseBalance.amount);
          await balanceRepository.updateAmount(reverseBalance.id, 0);
        } else if (reverseBalance.amount > balance.amount) {
          await balanceRepository.updateAmount(reverseBalance.id, reverseBalance.amount - balance.amount);
          await balanceRepository.updateAmount(balance.id, 0);
        } else {
          // Equal amounts - both become 0
          await balanceRepository.updateAmount(balance.id, 0);
          await balanceRepository.updateAmount(reverseBalance.id, 0);
        }
      }
    }
  },

  /**
   * Get all expenses for a group with details
   */
  async getGroupExpenses(groupId: string, userId: string): Promise<ServiceResult<any[]>> {
    // Verify user is a member
    const isMember = await groupRepository.isMember(groupId, userId);
    if (!isMember) {
      return errorResult('User is not a member of this group');
    }

    const { data, error } = await expenseRepository.getByGroupId(groupId);
    if (error) {
      return errorResult(error.message);
    }

    return successResult(data || []);
  },

  /**
   * Delete an expense and recalculate balances
   */
  async deleteExpense(expenseId: string, userId: string): Promise<ServiceResult<boolean>> {
    const { data: expense, error } = await expenseRepository.getById(expenseId);
    
    if (error || !expense) {
      return errorResult('Expense not found');
    }

    if (expense.paid_by !== userId) {
      return errorResult('Only the payer can delete an expense');
    }

    // Get splits before deletion
    const { data: splits } = await expenseRepository.getSplits(expenseId);

    // Delete expense
    const { error: deleteError } = await expenseRepository.delete(expenseId);
    if (deleteError) {
      return errorResult(deleteError.message);
    }

    // Reverse balance updates
    if (splits) {
      for (const split of splits) {
        if (split.user_id === expense.paid_by) continue;

        const { data: balance } = await balanceRepository.getOrCreate(
          expense.group_id,
          split.user_id,
          expense.paid_by
        );

        if (balance) {
          const newAmount = Math.max(0, balance.amount - split.amount);
          await balanceRepository.updateAmount(balance.id, newAmount);
        }
      }
    }

    return successResult(true);
  },
};
