import { withAuth } from "@/lib/api/handler";
import { apiOk } from "@/lib/api/respond";

/** Who is signed in: the session's profile. */
export const GET = withAuth("any", async ({ profile }) => apiOk({ profile }));
