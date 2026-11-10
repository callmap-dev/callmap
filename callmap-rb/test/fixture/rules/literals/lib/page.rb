class Page
  def render
    "Hello world".slugify
    'x'.slugify
    [1, 2].second
    %w[a b].second
    { a: 1 }.deep_keys
    :title.to_label
    5.minutes
  end
end
