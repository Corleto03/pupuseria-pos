import { Suspense } from "react";
import MesaOrdenPage from "./MesaOrdenClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-10 text-mute">Cargando mesa…</div>}>
      <MesaOrdenPage />
    </Suspense>
  );
}
