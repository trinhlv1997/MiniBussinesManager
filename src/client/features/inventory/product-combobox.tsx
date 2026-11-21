import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { formatNumber } from "@shared/format";
import type { Product } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useResourceList } from "@/lib/resource";

/** Searches on the server, so it works however many products the company has. */
export function ProductCombobox({
  label,
  invalid,
  onlyActive = false,
  placeholder = "Chọn sản phẩm",
  ariaLabel = "Chọn sản phẩm",
  onSelect,
}: {
  label?: string;
  invalid?: boolean;
  onlyActive?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  onSelect: (product: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const results = useResourceList<Product>("products", "/products", {
    search,
    pageSize: 8,
    sort: "name",
    dir: "asc",
    status: onlyActive ? "active" : undefined,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          aria-invalid={invalid}
          className="w-full justify-between font-normal"
        >
          <span className={label ? "truncate" : "truncate text-muted-foreground"}>{label || placeholder}</span>
          <ChevronsUpDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-2">
        <Input
          autoFocus
          aria-label="Tìm sản phẩm"
          placeholder="Tìm theo tên hoặc mã SKU"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <ul className="mt-2 max-h-64 overflow-y-auto">
          {results.data?.items.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onSelect(product);
                  setOpen(false);
                }}
              >
                <span className="block truncate">{product.name}</span>
                <span className="text-xs text-muted-foreground">
                  {product.sku} · Tồn {formatNumber(product.quantity)} {product.unit}
                </span>
              </button>
            </li>
          ))}
          {results.data?.items.length === 0 && (
            <li className="px-2 py-3 text-center text-sm text-muted-foreground">Không tìm thấy sản phẩm</li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
