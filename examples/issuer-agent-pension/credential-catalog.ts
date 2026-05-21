/**
 * Demo pension claim presets aligned with FindyFi's Paradym/Procivis demos:
 * https://github.com/FindyFi/pensioncredential-paradym
 *
 * One credential definition; different slugs select different claim values.
 */

export type PensionTypeCode = 'KAEL' | 'TKEL' | 'KUKI';

export type PensionClaims = {
  Person: {
    given_name: string;
    family_name: string;
    birth_date: string;
    personal_administrative_number: string;
  };
  Pension: {
    typeCode: PensionTypeCode;
    typeName: string;
    startDate: string;
    endDate?: string;
    provisional?: boolean;
  };
};

export type PensionCredentialEntry = {
  slug: string;
  label: string;
  typeCode: PensionTypeCode;
  claims: PensionClaims;
};

export const PENSION_CREDENTIAL_CATALOG = {
  kael: {
    slug: 'kael',
    label: 'Totti Aalto (KAEL)',
    typeCode: 'KAEL',
    claims: {
      Person: {
        personal_administrative_number: '030393-995E',
        birth_date: '1993-03-03',
        given_name: 'Totti',
        family_name: 'Aalto',
      },
      Pension: {
        typeCode: 'KAEL',
        typeName: 'Kansaneläke',
        startDate: '2024-02-01',
      },
    },
  },
  'tkel-provisional': {
    slug: 'tkel-provisional',
    label: 'Edwin Kelimtes (väliaikainen TKEL)',
    typeCode: 'TKEL',
    claims: {
      Person: {
        personal_administrative_number: '101283-999S',
        birth_date: '1983-12-10',
        given_name: 'Edwin',
        family_name: 'Kelimtes',
      },
      Pension: {
        typeCode: 'TKEL',
        typeName: 'Pysyvä työkyvyttömyyseläke',
        startDate: '2024-02-01',
        provisional: true,
      },
    },
  },
  'tkel-disability': {
    slug: 'tkel-disability',
    label: 'Joni Kai Hiltunen (TKEL)',
    typeCode: 'TKEL',
    claims: {
      Person: {
        personal_administrative_number: '010973-999Y',
        birth_date: '1973-09-01',
        given_name: 'Joni Kai',
        family_name: 'Hiltunen',
      },
      Pension: {
        typeCode: 'TKEL',
        typeName: 'Pysyvä työkyvyttömyyseläke',
        startDate: '2022-06-01',
      },
    },
  },
  kuki: {
    slug: 'kuki',
    label: 'Jonne Aapeli Setälä (KUKI)',
    typeCode: 'KUKI',
    claims: {
      Person: {
        personal_administrative_number: '010105A953F',
        birth_date: '2005-10-01',
        given_name: 'Jonne Aapeli',
        family_name: 'Setälä',
      },
      Pension: {
        typeCode: 'KUKI',
        typeName: 'Kuntoutustuki',
        startDate: '2024-01-01',
        endDate: '2026-12-31',
      },
    },
  },
  'kuki-expired': {
    slug: 'kuki-expired',
    label: 'Annina von Forsellestes (päättynyt KUKI)',
    typeCode: 'KUKI',
    claims: {
      Person: {
        personal_administrative_number: '031203A998K',
        birth_date: '2003-12-03',
        given_name: 'Annina',
        family_name: 'von Forsellestes',
      },
      Pension: {
        typeCode: 'KUKI',
        typeName: 'Rehabiliteringsstöd',
        startDate: '2022-12-01',
        endDate: '2023-11-01',
      },
    },
  },
} as const satisfies Record<string, PensionCredentialEntry>;

export type PensionCredentialSlug = keyof typeof PENSION_CREDENTIAL_CATALOG;

export function isPensionCredentialSlug(value: string): value is PensionCredentialSlug {
  return value in PENSION_CREDENTIAL_CATALOG;
}

export function listPensionCredentialOptions(): Array<{
  slug: PensionCredentialSlug;
  label: string;
  typeCode: PensionTypeCode;
}> {
  return Object.values(PENSION_CREDENTIAL_CATALOG).map(({ slug, label, typeCode }) => ({
    slug: slug as PensionCredentialSlug,
    label,
    typeCode,
  }));
}

export function getPensionClaimsBySlug(slug: string): PensionClaims {
  if (!isPensionCredentialSlug(slug)) {
    throw new Error(`Unknown pension credential slug: ${slug}`);
  }
  return PENSION_CREDENTIAL_CATALOG[slug].claims;
}
