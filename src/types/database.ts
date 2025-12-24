export type SplitType = 'equal' | 'exact' | 'percentage';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  joined_at: string;
  profile?: Profile;
}

export interface Expense {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  paid_by: string;
  split_type: SplitType;
  created_at: string;
  updated_at: string;
  payer?: Profile;
  splits?: ExpenseSplit[];
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number;
  percentage: number | null;
  profile?: Profile;
}

export interface Balance {
  id: string;
  group_id: string;
  debtor_id: string;
  creditor_id: string;
  amount: number;
  updated_at: string;
  debtor?: Profile;
  creditor?: Profile;
}

export interface Settlement {
  id: string;
  group_id: string;
  payer_id: string;
  payee_id: string;
  amount: number;
  created_at: string;
  payer?: Profile;
  payee?: Profile;
}

export interface UserBalance {
  userId: string;
  userName: string;
  netBalance: number; // positive = owed money, negative = owes money
}

export interface SimplifiedDebt {
  from: Profile;
  to: Profile;
  amount: number;
}
