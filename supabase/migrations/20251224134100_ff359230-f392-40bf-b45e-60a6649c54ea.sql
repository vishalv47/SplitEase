-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create groups table
CREATE TABLE public.groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create group_members table
CREATE TABLE public.group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Create expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  paid_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  split_type TEXT NOT NULL CHECK (split_type IN ('equal', 'exact', 'percentage')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create expense_splits table
CREATE TABLE public.expense_splits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  percentage DECIMAL(5, 2),
  UNIQUE(expense_id, user_id)
);

-- Create balances table (debtor owes creditor)
CREATE TABLE public.balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  debtor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  creditor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, debtor_id, creditor_id),
  CHECK (debtor_id != creditor_id)
);

-- Create settlements table
CREATE TABLE public.settlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  payer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Groups policies
CREATE POLICY "Users can view groups they belong to" ON public.groups FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = groups.id AND user_id = auth.uid()));
CREATE POLICY "Users can create groups" ON public.groups FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Group creators can update groups" ON public.groups FOR UPDATE 
  USING (auth.uid() = created_by);
CREATE POLICY "Group creators can delete groups" ON public.groups FOR DELETE 
  USING (auth.uid() = created_by);

-- Group members policies
CREATE POLICY "Users can view group members" ON public.group_members FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()));
CREATE POLICY "Group creators can add members" ON public.group_members FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND created_by = auth.uid()));
CREATE POLICY "Group creators can remove members" ON public.group_members FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND created_by = auth.uid()));

-- Expenses policies
CREATE POLICY "Users can view expenses in their groups" ON public.expenses FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = expenses.group_id AND user_id = auth.uid()));
CREATE POLICY "Group members can create expenses" ON public.expenses FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = expenses.group_id AND user_id = auth.uid()));
CREATE POLICY "Expense creators can update" ON public.expenses FOR UPDATE 
  USING (auth.uid() = paid_by);
CREATE POLICY "Expense creators can delete" ON public.expenses FOR DELETE 
  USING (auth.uid() = paid_by);

-- Expense splits policies
CREATE POLICY "Users can view expense splits" ON public.expense_splits FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.expenses e JOIN public.group_members gm ON e.group_id = gm.group_id WHERE e.id = expense_splits.expense_id AND gm.user_id = auth.uid()));
CREATE POLICY "Expense creator can manage splits" ON public.expense_splits FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.expenses WHERE id = expense_id AND paid_by = auth.uid()));
CREATE POLICY "Expense creator can delete splits" ON public.expense_splits FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.expenses WHERE id = expense_id AND paid_by = auth.uid()));

-- Balances policies
CREATE POLICY "Users can view balances in their groups" ON public.balances FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = balances.group_id AND user_id = auth.uid()));
CREATE POLICY "System can manage balances" ON public.balances FOR ALL 
  USING (auth.uid() = debtor_id OR auth.uid() = creditor_id);

-- Settlements policies
CREATE POLICY "Users can view settlements in their groups" ON public.settlements FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.group_members WHERE group_id = settlements.group_id AND user_id = auth.uid()));
CREATE POLICY "Users can create settlements" ON public.settlements FOR INSERT 
  WITH CHECK (auth.uid() = payer_id);

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  RETURN new;
END;
$$;

-- Trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update balances
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_balances_updated_at BEFORE UPDATE ON public.balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();