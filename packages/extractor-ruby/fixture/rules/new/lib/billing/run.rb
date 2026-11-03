module Billing
  class Run
    def call
      Invoice.new.total
      Invoice.new(1, 2).total
      Billing::Invoice.new { 1 }.total
      Cache.new.total
      Missing.new.total
    end
  end
end
