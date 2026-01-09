import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Shield, Zap, DollarSign, Layers } from "lucide-react";

const ruleTypeIcons: Record<string, typeof Shield> = {
  velocity: Zap,
  amount: DollarSign,
  structuring: Layers,
};

const severityColors: Record<string, string> = {
  high: 'bg-red-500/10 text-red-500',
  medium: 'bg-yellow-500/10 text-yellow-500',
  low: 'bg-blue-500/10 text-blue-500',
};

export const ComplianceRulesPanel = () => {
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['compliance-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_rules')
        .select(`
          id,
          rule_code,
          rule_name,
          rule_type,
          description,
          parameters,
          severity,
          is_active,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Compliance Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compliance Rules ({rules.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Parameters</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No compliance rules found
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => {
                  const Icon = ruleTypeIcons[rule.rule_type] || Shield;
                  return (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Icon className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{rule.rule_name}</p>
                            <p className="text-xs text-muted-foreground">{rule.rule_code}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{rule.rule_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={severityColors[rule.severity] || severityColors.medium}>
                          {rule.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <pre className="text-xs text-muted-foreground">
                          {JSON.stringify(rule.parameters, null, 0)}
                        </pre>
                      </TableCell>
                      <TableCell>
                        <Switch checked={rule.is_active} disabled />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
