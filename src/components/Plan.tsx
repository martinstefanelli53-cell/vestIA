import { useNavigate } from "react-router-dom";
import { Crown } from "lucide-react";
import { useEntitlements } from "@/hooks/data";
import { Button, Sheet } from "./ui";

/** Aviso de límite del plan gratuito, con acceso directo a Premium. */
export function LimitSheet({ kind, open, onClose }: { kind: "garments" | "outfits"; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { data } = useEntitlements();
  const premium = data?.plan.id === "premium";
  const limit = kind === "garments" ? data?.plan.garment_limit : data?.plan.daily_outfit_limit;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={kind === "garments" ? "Guardarropa completo" : "Límite diario alcanzado"}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" full onClick={onClose}>Ahora no</Button>
          {!premium && <Button full icon={<Crown className="h-4 w-4" />} onClick={() => { onClose(); navigate("/premium"); }}>Ver Premium</Button>}
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-graphite">
        {kind === "garments"
          ? `Tu plan ${data?.plan.name ?? ""} permite hasta ${limit ?? "—"} prendas. Podés eliminar alguna que ya no uses${premium ? "." : " o pasar a Premium para ampliar tu guardarropa."}`
          : `Ya generaste los ${limit ?? "—"} outfits que incluye tu plan ${data?.plan.name ?? ""} cada 24 horas. ${premium ? "Volvé a intentar más tarde." : "Volvé más tarde o pasá a Premium para seguir generando."} Mientras tanto, podés ver tus outfits guardados.`}
      </p>
    </Sheet>
  );
}
