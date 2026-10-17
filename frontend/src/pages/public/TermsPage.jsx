import React from 'react';
import PublicPageLayout from '../../components/PublicPageLayout';

const TermsPage = () => (
  <PublicPageLayout title="Terms of Service">
    <span className="pubpage-eyebrow">Legal</span>
    <h1 className="pubpage-title">Terms of Service</h1>
    <p className="pubpage-lede">
      These terms describe acceptable use of PrintsX and the responsibilities of the people who use
      it. By using PrintsX you agree to these terms.
    </p>
    <p className="pubpage-meta">Last updated: October 2026 &nbsp;·&nbsp; Contact: contact@printsx.in</p>

    <h2>Acceptable use</h2>
    <p>
      Use PrintsX only for lawful document editing and printing. Do not upload content you do not
      have the right to use, or content that is illegal, harmful, or infringing.
    </p>

    <h2>Your responsibilities</h2>
    <ul>
      <li>You are responsible for the documents and instructions you submit.</li>
      <li>You should review the preview before approving a job.</li>
      <li>You confirm you have the right to print the content you submit.</li>
    </ul>

    <h2>Document ownership</h2>
    <p>
      You retain ownership of the documents you upload. PrintsX processes them to deliver the
      requested editing, preview, and printing workflow.
    </p>

    <h2>Print-shop responsibilities</h2>
    <p>
      Print shops using PrintsX are responsible for operating their own equipment and for completing
      print jobs they accept. PrintsX provides the software workflow that connects customers and
      shops.
    </p>

    <h2>AI-assisted operations</h2>
    <p>
      PrintsX uses AI to understand your intent, while document changes are applied by deterministic
      operations. Automated preparation can still produce results that need review — that is why a
      preview and explicit approval step exist. Always review the preview before approving.
    </p>

    <h2>Service availability</h2>
    <p>
      PrintsX is offered on an &ldquo;as available&rdquo; basis. We may update, suspend, or change
      parts of the service, and availability is not guaranteed.
    </p>

    <h2>Limitation of liability</h2>
    <p>
      To the extent permitted by law, PrintsX is not liable for indirect or consequential losses
      arising from use of the service. Nothing here limits liability that cannot be limited by law.
    </p>

    <h2>Changes to the service</h2>
    <p>
      We may change these terms as the product evolves. Continued use after an update means you
      accept the revised terms.
    </p>

    <h2>Contact</h2>
    <p>Questions about these terms? Contact us at contact@printsx.in.</p>
  </PublicPageLayout>
);

export default TermsPage;
