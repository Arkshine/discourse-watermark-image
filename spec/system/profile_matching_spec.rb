# frozen_string_literal: true

RSpec.describe "Watermark - profile matching", system: true do
  let!(:theme) { upload_theme_component }
  fab!(:user, :admin)
  fab!(:matched_category, :category)
  fab!(:other_category, :category)

  let(:topic_page) { PageObjects::Pages::Topic.new }
  let(:composer) { PageObjects::Components::Composer.new }
  let(:fixture_path) { file_from_fixtures("logo.png", "images").path }
  let(:original_sha1) { Digest::SHA1.file(fixture_path).hexdigest }

  before do
    theme.update_setting(
      :watermark_profiles,
      [
        {
          "name" => "category profile",
          "enabled" => true,
          "categories" => [matched_category.id],
          "groups" => [5], # AUTO_GROUPS.logged_in_users
          "source" => "text",
          "text" => "WATERMARKED",
        },
      ],
    )
    theme.save!
  end

  def upload_and_submit(category)
    sign_in(user)
    topic_page.open_new_topic
    composer.fill_title("Watermark profile matching test")
    composer.switch_category(category.name)

    attach_file("file-uploader", fixture_path, make_visible: true)

    expect(composer).to have_no_in_progress_uploads
    expect(composer.preview).to have_css(".image-wrapper")

    composer.submit

    expect(page).to have_css(".fancy-title")
  end

  it "applies the watermark when the upload's category matches an enabled profile" do
    upload_and_submit(matched_category)

    expect(topic_page.current_topic.first_post.uploads.first.sha1).not_to eq(original_sha1)
  end

  it "leaves the upload untouched when no profile matches and default_enabled is off" do
    upload_and_submit(other_category)

    expect(topic_page.current_topic.first_post.uploads.first.sha1).to eq(original_sha1)
  end
end
