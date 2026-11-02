module Auditable
  include ActiveModel::Validations

  def audit
    total
  end
end
