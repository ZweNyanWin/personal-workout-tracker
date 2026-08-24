import { LoaderCircle } from "lucide-react";

export default function AppLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        Loading
      </div>
    </div>
  );
}
