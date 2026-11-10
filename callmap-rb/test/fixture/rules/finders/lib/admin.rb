class Admin
  def load(id)
    @account ||= Account.find(id)
  end

  def run(id)
    Account.find(id).suspend
    account = Account.find_by name: id
    account.suspend
    @account.suspend
    Account.where(id).suspend
    Vault.create.suspend
    Ledger.find(id).suspend
  end
end
