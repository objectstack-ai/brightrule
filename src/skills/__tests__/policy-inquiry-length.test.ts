import { describe, it, expect } from 'vitest';
import { PolicyInquirySkill } from '../policy-inquiry.skill.js';

// The platform loads an app's skills only while their composed text stays
// under 6,000 characters (cloud `packages/service-ai/src/package-skills.ts`,
// PACKAGE_SKILL_TEXT_CAP, ADR-0118 D5). A skill over it is left out of the
// turn whole, with only a log line. Keep a margin for the section header the
// platform adds around label, description and instructions.
const PLATFORM_CAP = 6_000;
const MARGIN = 400;

describe('the policy-inquiry skill text', () => {
  it('stays under the platform cap for app skills', () => {
    const { label = '', description = '', instructions = '' } = PolicyInquirySkill as {
      label?: string;
      description?: string;
      instructions?: string;
    };
    const size = label.length + description.length + instructions.length;
    expect(size).toBeLessThanOrEqual(PLATFORM_CAP - MARGIN);
  });
});
