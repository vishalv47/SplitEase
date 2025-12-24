import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Layout from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/balanceUtils';
import { Users, Receipt, TrendingUp, TrendingDown, Plus, ArrowRight } from 'lucide-react';

interface DashboardStats {
  totalGroups: number;
  totalExpenses: number;
  youOwe: number;
  youAreOwed: number;
}

export default function Index() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalGroups: 0,
    totalExpenses: 0,
    youOwe: 0,
    youAreOwed: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  const fetchStats = async () => {
    try {
      // Get group count
      const { count: groupCount } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id);

      // Get balances where user owes
      const { data: debts } = await supabase
        .from('balances')
        .select('amount')
        .eq('debtor_id', user!.id)
        .gt('amount', 0);

      // Get balances where user is owed
      const { data: credits } = await supabase
        .from('balances')
        .select('amount')
        .eq('creditor_id', user!.id)
        .gt('amount', 0);

      const youOwe = debts?.reduce((sum, b) => sum + Number(b.amount), 0) || 0;
      const youAreOwed = credits?.reduce((sum, b) => sum + Number(b.amount), 0) || 0;

      setStats({
        totalGroups: groupCount || 0,
        totalExpenses: 0,
        youOwe,
        youAreOwed,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Groups',
      value: stats.totalGroups,
      icon: Users,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      title: 'You Owe',
      value: formatCurrency(stats.youOwe),
      icon: TrendingDown,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    },
    {
      title: 'You Are Owed',
      value: formatCurrency(stats.youAreOwed),
      icon: TrendingUp,
      color: 'text-success',
      bg: 'bg-success/10',
    },
  ];

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">
              Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}!
            </h1>
            <p className="text-muted-foreground mt-1">
              Here's an overview of your expense sharing activity
            </p>
          </div>
          <Link to="/groups">
            <Button variant="hero" size="lg" className="gap-2">
              <Plus className="h-5 w-5" />
              New Group
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bg}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${stat.color}`}>
                    {loading ? '...' : stat.value}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Your Groups
              </CardTitle>
              <CardDescription>
                Manage your expense sharing groups
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/groups">
                <Button variant="outline" className="w-full gap-2">
                  View All Groups
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                Recent Activity
              </CardTitle>
              <CardDescription>
                Track your latest expenses and settlements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Create a group to start tracking expenses!
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
