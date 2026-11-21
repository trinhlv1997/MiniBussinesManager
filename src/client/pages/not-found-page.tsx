import { SearchX } from "lucide-react";
import { Link } from "react-router";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={SearchX}
      title="Không tìm thấy trang"
      description="Trang bạn tìm không tồn tại hoặc đã được chuyển đi."
      action={
        <Button asChild>
          <Link to="/">Về trang Tổng quan</Link>
        </Button>
      }
    />
  );
}
