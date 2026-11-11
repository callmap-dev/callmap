module Billable
  include ActiveModel::Validations

  def invoice
    total
  end
end
