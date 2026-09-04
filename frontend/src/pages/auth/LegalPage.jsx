import React from 'react';
import { useParams, Link } from 'react-router-dom';

/**
 * Legal pages — Terms of Service, Community Guidelines, Privacy Policy.
 * Ported verbatim from DUYS/templates/legal/*.html.
 * Renders standalone (brand + back-to-login) so it works pre-auth.
 */

const DOCS = {
  terms: {
    title: 'Terms of Service',
    body: [
      ['Welcome to DUYS', 'By creating an account or using the service you agree to these Terms.'],
      ['1. Your account', 'You must provide accurate information and keep your password secure. You are responsible for all activity under your account. You must be at least 13 years old to use DUYS.'],
      ['2. $DUYS points & wallet', '$DUYS points are an in-app rewards unit and carry no guaranteed monetary value. Wallet deposits, withdrawals, tips and boosts are subject to review and applicable fees. Fraudulent activity may result in forfeiture of points or balances.'],
      ['3. Content you post', 'You retain ownership of content you create, and grant DUYS a licence to host and display it to operate the service. You are responsible for your content and must hold the rights to it.'],
      ['4. Acceptable use', 'Do not use DUYS for unlawful, harmful, infringing or deceptive activity. See our Community Guidelines for details.'],
      ['5. Monetization & ads', 'Boosted posts are labelled "Sponsored". Verification badges are granted at our discretion after review. We may run ads and reward viewing with $DUYS points.'],
      ['6. Termination', 'We may suspend or terminate accounts that violate these Terms. You may delete your account at any time from Settings, which removes your data and media from our systems.'],
      ['7. Disclaimer', 'The service is provided "as is" without warranties. To the extent permitted by law, DUYS is not liable for indirect or consequential damages.'],
      ['8. Changes', 'We may update these Terms; continued use after changes constitutes acceptance.'],
    ],
  },
  guidelines: {
    title: 'Community Guidelines',
    body: [
      ['Welcome', 'DUYS is a place to post, connect, broadcast and earn. These guidelines keep it safe for everyone.'],
      ['Be respectful', 'No harassment, hate speech, threats, or targeting people based on protected characteristics.'],
      ['No illegal or harmful content', 'Do not post content that is unlawful, promotes violence, exploits minors, or facilitates fraud or scams, including deceptive crypto or "airdrop" schemes.'],
      ['Authenticity', 'No impersonation, fake engagement, bots, or manipulating $DUYS rewards, referrals, or the leaderboard. View-once and disappearing media must not be used to harass or distribute prohibited content.'],
      ['Adult & sensitive content', 'No pornography or gratuitous violence. Mark sensitive content appropriately where tools are provided.'],
      ['Intellectual property', 'Only post content you own or have the right to share. Respect copyrights and trademarks.'],
      ['Advertising', 'Boosted/Sponsored posts must follow advertising standards and link to safe, accurate landing pages.'],
      ['Reporting & enforcement', 'Violations may lead to content removal, loss of verification, or account suspension. Admins review verification and reported content manually.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    body: [
      ['Policy overview', 'This policy explains what DUYS collects and how we use it.'],
      ['What we collect', 'Account info: email, username, display name, and (if you sign in with Google) your Google profile basics. Content you create: posts, stories, messages, media, and engagement. Usage & device data, and presence (online/last-seen) to power the app. Wallet & points activity for deposits, withdrawals, tips, boosts and rewards.'],
      ['How we use it', 'To operate and secure the service, personalize your feed, process payments and rewards, and prevent abuse.'],
      ['Storage & security', 'Data is stored in a secure database; media is stored in object storage (Cloudflare R2). Passwords are hashed. Two-factor authentication is available.'],
      ['Disappearing & deleted content', 'View-once media is deleted from our database and storage after it is viewed. Stories expire after 24 hours and are removed. Deleting your account or content removes it from our database and storage.'],
      ['Sharing', 'We do not sell your personal data. We share data only with providers needed to run the service (e.g. authentication, storage) or where required by law.'],
      ['Your choices', 'You can edit your profile, manage 2FA, control your theme, and delete your account at any time from Settings.'],
      ['Contact', 'Questions about privacy? Contact the DUYS team.'],
    ],
  },
};
function LegalPage() {
  const { page } = useParams();
  const doc = DOCS[page] || DOCS.terms;
  const others = [
    { key: 'terms', label: 'Terms of Service' },
    { key: 'guidelines', label: 'Community Guidelines' },
    { key: 'privacy', label: 'Privacy Policy' },
  ];

  return (
    <div className="auth-page">
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-grid" style={{ gridTemplateColumns: '1fr', minHeight: '100vh' }}>
        <div className="auth-card" style={{ maxWidth: 720, minHeight: '100vh' }}>
          <div className="flex items-center gap-3 mb-6">
            <img src="/logo.png" width="36" height="36" alt="DUYS" />
            <span className="font-bold text-xl">DUYS</span>
          </div>

          <h1 className="text-3xl font-bold mb-1">{doc.title}</h1>
          <p className="text-sm text-gray-400 mb-6">Last updated: 2026</p>

          <div className="flex flex-wrap gap-2 mb-6">
            {others.map((o) => (
              <Link
                key={o.key}
                to={`/legal/${o.key}`}
                className={`px-3 py-1 rounded-full text-sm font-semibold border ${
                  o.key === page
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                {o.label}
              </Link>
            ))}
          </div>

          <article className="space-y-6">
            {doc.body.map(([heading, text]) => (
              <section key={heading}>
                <h2 className="text-lg font-bold mb-1">{heading}</h2>
                <p className="text-gray-300 text-sm leading-relaxed">{text}</p>
              </section>
            ))}
          </article>

          <div className="auth-switch mt-8">
            <Link to="/login">← Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LegalPage;