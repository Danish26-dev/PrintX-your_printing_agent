import React from 'react';
import PublicPageLayout from '../../components/PublicPageLayout';

const PrivacyPage = () => (
  <PublicPageLayout title="Privacy Policy">
    <span className="pubpage-eyebrow">Trust</span>
    <h1 className="pubpage-title">
      Your document should not become <span className="pubpage-gradient">someone else&rsquo;s file</span>
    </h1>
    <p className="pubpage-lede">
      PrintsX is built around privacy-first document processing. Documents are processed for the
      requested print workflow rather than becoming a permanent customer profile.
    </p>
    <p className="pubpage-meta">Last updated: October 2026 &nbsp;·&nbsp; Contact: contact@printsx.in</p>

    <h2>What this policy covers</h2>
    <p>
      This policy describes how the PrintsX product handles information in its current form. It
      reflects the behavior actually implemented in the application and will be updated as the
      product evolves.
    </p>

    <h2>Information PrintsX handles</h2>
    <h3>Shopkeeper account information</h3>
    <p>
      Print-shop operators sign in with Google. For authenticated shopkeepers, PrintsX uses the
      identity information provided by Google Sign-In (such as the account email) to authorize
      access to the shopkeeper dashboard. Customers do not need an account to use the customer
      workflow.
    </p>
    <h3>Documents you upload</h3>
    <p>
      When you send a document to a shop, PrintsX receives the file so it can be edited (per your
      instructions), prepared for preview, and configured for printing. Your natural-language
      instruction and the resulting job details are also handled as part of the workflow.
    </p>

    <h2>How documents are processed</h2>
    <ul>
      <li>Your instruction is interpreted into a concrete editing plan.</li>
      <li>Document changes are applied by a deterministic document engine.</li>
      <li>A preview is generated for you to review before approval.</li>
      <li>Verified print settings are attached to the job for the shop.</li>
    </ul>

    <h2>Storage and retention</h2>
    <p>
      Document files are stored using a cloud storage backend, and job records are kept in a
      database so the shop can see and process the job. The application includes a cleanup
      operation that removes a job&rsquo;s stored files. Retention windows are configured by the
      shop operator; if you need the specific retention period for a given print shop, contact us at
      contact@printsx.in.
    </p>

    <h2>Third-party / cloud services</h2>
    <p>
      PrintsX runs on cloud infrastructure and uses services for authentication, storage, databases,
      and AI document understanding. These services process data on PrintsX&rsquo;s behalf to deliver
      the workflow. We do not sell your documents or use them to build a marketing profile.
    </p>

    <h2>Security practices</h2>
    <ul>
      <li>Shopkeeper access is authenticated and authorization is controlled.</li>
      <li>The customer experience and the shopkeeper experience are separated.</li>
      <li>Backend operations that act on behalf of a shop are access-controlled.</li>
    </ul>
    <p>
      PrintsX uses a privacy-first architecture. We do not claim any formal certification (such as
      ISO, SOC 2, GDPR, or HIPAA) unless and until it is actually obtained.
    </p>

    <h2>Your choices</h2>
    <p>
      If you have questions about a document you submitted, or want information about data handling
      for a specific print shop, contact us at contact@printsx.in.
    </p>

    <h2>Changes to this policy</h2>
    <p>
      We may update this policy as the product changes. Material updates will be reflected by the
      &ldquo;Last updated&rdquo; date above.
    </p>
  </PublicPageLayout>
);

export default PrivacyPage;
