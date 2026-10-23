import { Page, PageHeader } from "../../../components/PageHeader";

export default function HelpPage() {
  return (
    <Page>
      <PageHeader title="Help" subtitle="How this desk works" />
      <div className="card stack">
        <p>Upload a referral PDF from Inbox. Review the extract. Looks good starts the chart write. Every write needs a person.</p>
        <p className="muted">Add a doctor from Settings. Live phone and EHR connect are not in this build.</p>
      </div>
    </Page>
  );
}
