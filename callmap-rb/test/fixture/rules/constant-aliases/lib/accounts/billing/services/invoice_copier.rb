module Accounts::Billing
  class Services::InvoiceCopier
    Plan = Services::InvoicePlan
    Index = ::Shared::Services::LedgerIndex
    Chained = Plan
    RequestError = ::Faraday::Error
    Loop = Services::InvoiceCopier::Cycle
    Cycle = Services::InvoiceCopier::Loop

    def plan; Plan.build(1); end
    def code; Index.code_for(2); end
    def chained; Chained.build(3); end
    def failure; RequestError.build(4); end
    def direct_failure; ::Faraday::Error.build(5); end
    def loop; Loop.build(6); end
  end
end
