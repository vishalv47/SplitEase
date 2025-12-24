import { Balance, Profile, SimplifiedDebt, UserBalance } from '@/types/database';

/**
 * Calculate net balances for all users in a group
 */
export function calculateNetBalances(balances: Balance[], profiles: Profile[]): UserBalance[] {
  const netBalanceMap = new Map<string, number>();
  
  // Initialize all users with 0 balance
  profiles.forEach(profile => {
    netBalanceMap.set(profile.id, 0);
  });
  
  // Calculate net balance for each user
  balances.forEach(balance => {
    const currentCreditorBalance = netBalanceMap.get(balance.creditor_id) || 0;
    const currentDebtorBalance = netBalanceMap.get(balance.debtor_id) || 0;
    
    // Creditor is owed money (positive)
    netBalanceMap.set(balance.creditor_id, currentCreditorBalance + balance.amount);
    // Debtor owes money (negative)
    netBalanceMap.set(balance.debtor_id, currentDebtorBalance - balance.amount);
  });
  
  return profiles.map(profile => ({
    userId: profile.id,
    userName: profile.full_name || profile.email,
    netBalance: netBalanceMap.get(profile.id) || 0,
  }));
}

/**
 * Simplify debts to minimize number of transactions
 * Uses a greedy algorithm to match creditors with debtors
 */
export function simplifyDebts(balances: Balance[], profiles: Profile[]): SimplifiedDebt[] {
  const netBalances = calculateNetBalances(balances, profiles);
  const profileMap = new Map(profiles.map(p => [p.id, p]));
  
  // Separate creditors (positive balance) and debtors (negative balance)
  const creditors: { userId: string; amount: number }[] = [];
  const debtors: { userId: string; amount: number }[] = [];
  
  netBalances.forEach(balance => {
    if (balance.netBalance > 0.01) {
      creditors.push({ userId: balance.userId, amount: balance.netBalance });
    } else if (balance.netBalance < -0.01) {
      debtors.push({ userId: balance.userId, amount: Math.abs(balance.netBalance) });
    }
  });
  
  // Sort by amount (largest first for efficiency)
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);
  
  const simplifiedDebts: SimplifiedDebt[] = [];
  
  // Greedy matching
  let i = 0;
  let j = 0;
  
  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];
    
    const amount = Math.min(creditor.amount, debtor.amount);
    
    if (amount > 0.01) {
      const fromProfile = profileMap.get(debtor.userId);
      const toProfile = profileMap.get(creditor.userId);
      
      if (fromProfile && toProfile) {
        simplifiedDebts.push({
          from: fromProfile,
          to: toProfile,
          amount: Math.round(amount * 100) / 100,
        });
      }
    }
    
    creditor.amount -= amount;
    debtor.amount -= amount;
    
    if (creditor.amount < 0.01) i++;
    if (debtor.amount < 0.01) j++;
  }
  
  return simplifiedDebts;
}

/**
 * Calculate split amounts based on split type
 */
export function calculateSplitAmounts(
  totalAmount: number,
  participants: string[],
  splitType: 'equal' | 'exact' | 'percentage',
  customAmounts?: Map<string, number>
): Map<string, number> {
  const amounts = new Map<string, number>();
  
  if (splitType === 'equal') {
    const perPerson = totalAmount / participants.length;
    participants.forEach(userId => {
      amounts.set(userId, Math.round(perPerson * 100) / 100);
    });
  } else if (splitType === 'exact' && customAmounts) {
    customAmounts.forEach((amount, userId) => {
      amounts.set(userId, amount);
    });
  } else if (splitType === 'percentage' && customAmounts) {
    customAmounts.forEach((percentage, userId) => {
      const amount = (totalAmount * percentage) / 100;
      amounts.set(userId, Math.round(amount * 100) / 100);
    });
  }
  
  return amounts;
}

/**
 * Validate split amounts
 */
export function validateSplit(
  totalAmount: number,
  splitType: 'equal' | 'exact' | 'percentage',
  customAmounts?: Map<string, number>
): { valid: boolean; error?: string } {
  if (splitType === 'exact' && customAmounts) {
    let sum = 0;
    customAmounts.forEach(amount => {
      sum += amount;
    });
    
    if (Math.abs(sum - totalAmount) > 0.01) {
      return { 
        valid: false, 
        error: `Amounts must sum to ${totalAmount.toFixed(2)}. Current sum: ${sum.toFixed(2)}` 
      };
    }
  }
  
  if (splitType === 'percentage' && customAmounts) {
    let sum = 0;
    customAmounts.forEach(percentage => {
      sum += percentage;
    });
    
    if (Math.abs(sum - 100) > 0.01) {
      return { 
        valid: false, 
        error: `Percentages must sum to 100%. Current sum: ${sum.toFixed(2)}%` 
      };
    }
  }
  
  return { valid: true };
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
