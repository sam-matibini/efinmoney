import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface Props { title: string; description: string }
const AdminPlaceholderPage = ({ title, description }: Props) => (
  <AdminLayout>
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
            <Construction className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="text-sm text-muted-foreground">Coming in the next phase of the admin portal build.</div>
        </CardContent>
      </Card>
    </div>
  </AdminLayout>
);

export default AdminPlaceholderPage;
