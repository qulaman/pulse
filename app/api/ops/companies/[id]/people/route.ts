import { apiOk } from "@/lib/api/respond";
import { addOpsPerson } from "@/lib/ops/accounts";
import { AddPersonBodySchema, type AddPersonAnswer } from "@/lib/ops/contract";
import { withOps } from "@/lib/ops/handler";

export const POST = withOps(
  {
    schema: AddPersonBodySchema,
    action: "add_person",
    company: ({ params }) => params.id,
    target: ({ body }) => ({ role: body.role }),
  },
  async ({ service, ticket, body, params }) => {
    const userId = await addOpsPerson(service, {
      ticket,
      company: params.id,
      fullName: body.full_name,
      role: body.role,
      position: body.position,
      email: body.email,
    });
    return apiOk({ user_id: userId, duplicate: false } satisfies AddPersonAnswer, 201);
  },
);
