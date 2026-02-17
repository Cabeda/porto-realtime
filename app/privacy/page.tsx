"use client";

import { useTranslations } from "@/lib/hooks/useTranslations";

export default function PrivacyPage() {
  const t = useTranslations();
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 pb-24 text-content">
      <h1 className="text-2xl font-bold mb-6">{t.privacy.title}</h1>
      <p className="text-sm text-content-muted mb-6">{t.privacy.lastUpdated}</p>

      <section className="space-y-6 text-sm leading-relaxed text-content-secondary">
        <div>
          <h2 className="text-base font-semibold text-content mb-2">{t.privacy.whatWeCollectTitle}</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>{t.privacy.collectEmail}</li>
            <li>{t.privacy.collectName}</li>
            <li>{t.privacy.collectFeedback}</li>
            <li>{t.privacy.collectCheckin}</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-content mb-2">{t.privacy.locationTitle}</h2>
          <p>{t.privacy.locationDesc}</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-content mb-2">{t.privacy.howWeUseTitle}</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>{t.privacy.useAuth}</li>
            <li>{t.privacy.useFeedback}</li>
            <li>{t.privacy.useActivity}</li>
          </ul>
        </div>

        <div>
          <h2 className="text-base font-semibold text-content mb-2">{t.privacy.dataRetentionTitle}</h2>
          <p>{t.privacy.dataRetentionDesc}</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-content mb-2">{t.privacy.yourRightsTitle}</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>{t.privacy.rightAccess}</li>
            <li>{t.privacy.rightExport}</li>
            <li>{t.privacy.rightDeletion}</li>
            <li>{t.privacy.rightRectification}</li>
          </ul>
          <p className="mt-2">{t.privacy.rightsHow}</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-content mb-2">{t.privacy.localStorageTitle}</h2>
          <p>{t.privacy.localStorageDesc}</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-content mb-2">{t.privacy.thirdPartyTitle}</h2>
          <p>{t.privacy.thirdPartyDesc}</p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-content mb-2">{t.privacy.contactTitle}</h2>
          <p>{t.privacy.contactDesc}</p>
        </div>
      </section>
    </main>
  );
}
