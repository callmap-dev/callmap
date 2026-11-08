class Refund
  include Billable

  def total
    Ledger.total
  end

  def note
    format("%d", 1).strip
  end
end

module Books
  class Ledger
  end
end
