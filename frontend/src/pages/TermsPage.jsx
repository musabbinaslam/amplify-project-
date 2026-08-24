import React from 'react';

const TermsPage = () => {
  return (
    <div style={{ padding: '80px 20px', maxWidth: '800px', margin: '0 auto', color: '#fff', fontFamily: 'system-ui, sans-serif', lineHeight: '1.6' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Calls Flow LLC</h1>
      <h2 style={{ fontSize: '24px', marginBottom: '8px', color: '#bbb' }}>Terms of Service & Privacy Policy</h2>
      <p style={{ color: '#888', marginBottom: '40px' }}>Effective Date: July 1, 2026</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <section>
          <h3 style={{ fontSize: '20px', marginBottom: '12px', color: '#fff' }}>1. Acceptance of Terms.</h3>
          <p style={{ color: '#ccc' }}>By accessing or using the Calls Flow LLC platform located at callsflow.io (the "Platform"), you agree to be bound by these Terms of Service. If you do not agree to these Terms, you may not access or use the Platform.</p>
        </section>

        <section>
          <h3 style={{ fontSize: '20px', marginBottom: '12px', color: '#fff' }}>2. Services.</h3>
          <p style={{ color: '#ccc', marginBottom: '8px' }}>Calls Flow LLC provides users with the ability to purchase credits that may be used to access and purchase marketing leads and related services through the Platform.</p>
          <p style={{ color: '#ccc' }}>Calls Flow LLC does not guarantee the accuracy, quality, responsiveness, conversion rate, profitability, or business outcome of any lead provided through the Platform.</p>
        </section>

        <section>
          <h3 style={{ fontSize: '20px', marginBottom: '12px', color: '#fff' }}>3. Credit Purchases.</h3>
          <p style={{ color: '#ccc' }}>All credits purchased on the Platform are non-transferable and may only be used through the Platform in accordance with these Terms. Credits have no cash value and may not be redeemed for cash.</p>
        </section>

        <section>
          <h3 style={{ fontSize: '20px', marginBottom: '12px', color: '#fff' }}>4. No Refund Policy.</h3>
          <p style={{ color: '#ccc' }}>ALL SALES ARE FINAL. By purchasing credits, you expressly acknowledge and agree that:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', color: '#ccc' }}>
            <li>All purchases are final and non-refundable.</li>
            <li>No refunds, credits, exchanges, or chargebacks will be provided for credits that have been purchased or used.</li>
            <li>Credits are deemed consumed when used to access, unlock, purchase, or contact leads through the Platform.</li>
            <li>Dissatisfaction with lead quality, lead responsiveness, conversion rates, business results, or campaign performance does not entitle a user to a refund.</li>
          </ul>
        </section>

        <section>
          <h3 style={{ fontSize: '20px', marginBottom: '12px', color: '#fff' }}>5. Lead Quality Disclaimer.</h3>
          <p style={{ color: '#ccc' }}>Calls Flow LLC makes no representation or warranty regarding:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', color: '#ccc' }}>
            <li>The accuracy of any lead information;</li>
            <li>Whether a lead will respond;</li>
            <li>Whether a lead will be interested in a user's products or services;</li>
            <li>Whether a lead will convert into a sale;</li>
            <li>Any revenues, profits, or return on investment.</li>
          </ul>
          <p style={{ color: '#ccc', marginTop: '12px' }}>Users acknowledge that marketing leads involve inherent uncertainty and that business results may vary.</p>
        </section>

        <section>
          <h3 style={{ fontSize: '20px', marginBottom: '12px', color: '#fff' }}>6. Chargebacks and Payment Disputes.</h3>
          <p style={{ color: '#ccc' }}>By completing a purchase, you agree not to initiate a chargeback or payment dispute for any credits that have been delivered, accessed, or used. If a chargeback is initiated for credits that have been delivered or consumed:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', color: '#ccc' }}>
            <li>Calls Flow LLC reserves the right to suspend or terminate the user's account;</li>
            <li>Revoke unused credits;</li>
            <li>Pursue collection of amounts improperly disputed;</li>
            <li>Recover attorneys' fees, costs, and expenses incurred in responding to the chargeback or collection proceedings where permitted by law.</li>
          </ul>
        </section>

        <section>
          <h3 style={{ fontSize: '20px', marginBottom: '12px', color: '#fff' }}>7. Account Suspension.</h3>
          <p style={{ color: '#ccc' }}>Calls Flow LLC reserves the right to suspend or terminate any account suspected of fraud, abuse, unauthorized activity, misuse of purchased leads, or violation of these Terms.</p>
        </section>

        <section>
          <h3 style={{ fontSize: '20px', marginBottom: '12px', color: '#fff' }}>8. Limitation of Liability.</h3>
          <p style={{ color: '#ccc' }}>To the fullest extent permitted by law, Calls Flow LLC shall not be liable for any indirect, incidental, consequential, special, exemplary, or punitive damages, including lost profits, lost business opportunities, lost revenue, or loss of goodwill arising out of or related to the use of the Platform or any leads obtained through the Platform. The total liability of Calls Flow LLC for any claim shall not exceed the amount paid by the user to Calls Flow LLC during the thirty (30) days preceding the event giving rise to the claim.</p>
        </section>

        <section>
          <h3 style={{ fontSize: '20px', marginBottom: '12px', color: '#fff' }}>9. Indemnification.</h3>
          <p style={{ color: '#ccc' }}>Users agree to indemnify, defend, and hold harmless Calls Flow LLC and its officers, directors, members, employees, and agents from any claims, damages, liabilities, costs, and expenses arising from:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', color: '#ccc' }}>
            <li>The user's use of the Platform;</li>
            <li>The user's contact with leads;</li>
            <li>The user's violation of any law or regulation; or</li>
            <li>The user's breach of these Terms.</li>
          </ul>
        </section>

        <section>
          <h3 style={{ fontSize: '20px', marginBottom: '12px', color: '#fff' }}>10. Governing Law.</h3>
          <p style={{ color: '#ccc' }}>These Terms shall be governed by and construed in accordance with the laws of the Commonwealth of Texas, without regard to conflict-of-law principles.</p>
        </section>

        <section>
          <h3 style={{ fontSize: '20px', marginBottom: '12px', color: '#fff' }}>11. Arbitration.</h3>
          <p style={{ color: '#ccc' }}>Any dispute arising out of or relating to these Terms or the Platform shall be resolved through binding arbitration administered by the American Arbitration Association. The parties waive any right to a jury trial or participation in a class action. Any such arbitration proceeding shall take place in Waller county, Texas.</p>
        </section>

        <section>
          <h3 style={{ fontSize: '20px', marginBottom: '12px', color: '#fff' }}>12. Modifications.</h3>
          <p style={{ color: '#ccc' }}>Calls Flow LLC may modify these Terms at any time. Continued use of the Platform after modifications become effective constitutes acceptance of the revised Terms.</p>
        </section>

        <section>
          <h3 style={{ fontSize: '20px', marginBottom: '12px', color: '#fff' }}>13. Contact Information.</h3>
          <p style={{ color: '#ccc' }}>
            <strong>Calls Flow LLC</strong><br/>
            Email: <a href="mailto:Admin@callsflow.io" style={{ color: '#60a5fa', textDecoration: 'none' }}>Admin@callsflow.io</a><br/>
            Website: <a href="https://callsflow.io" style={{ color: '#60a5fa', textDecoration: 'none' }}>callsflow.io</a>
          </p>
        </section>
      </div>
    </div>
  );
};

export default TermsPage;
