import { redirect } from "next/navigation";
import { HOME_BY_ROLE } from "@/lib/me";
import { getServerMe } from "@/lib/server-me";

export default async function HomePage() {
  const me = await getServerMe();
  redirect(me ? HOME_BY_ROLE[me.appRole] : "/login");
}
