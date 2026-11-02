class Post
  include Searchable

  def self.top
    search
  end
end
