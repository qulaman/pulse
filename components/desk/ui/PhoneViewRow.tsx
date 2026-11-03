"use client";

import { Row } from "@/components/ui/Row";
import { goPhoneView } from "@/lib/desk/device";
import { homeForRole, type Role } from "@/lib/routes";

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <line x1="11" y1="18.5" x2="13" y2="18.5" />
    </svg>
  );
}

/** «Телефонная версия»: this computer keeps the phone screens until the phone profile's «Версия для компьютера». */
export function PhoneViewRow({ role }: { role: Role }) {
  return <Row icon={<PhoneIcon />} title="Телефонная версия" value="на этом компьютере" onClick={() => goPhoneView(homeForRole(role))} />;
}
