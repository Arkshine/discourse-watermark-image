# frozen_string_literal: true

RSpec.describe "Watermark - reprocess", system: true do
  let!(:theme) { upload_theme_component }
  fab!(:user, :admin)

  let(:topic_page) { PageObjects::Pages::Topic.new }
  let(:composer) { PageObjects::Components::Composer.new }
  let(:fixture_path) { file_from_fixtures("logo.png", "images").path }

  context "when category changes" do
    fab!(:matched_category, :category)
    fab!(:other_category, :category)

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

    it "re-watermarks an already-uploaded image on each subsequent category change" do
      sign_in(user)
      topic_page.open_new_topic
      composer.fill_title("Reprocess on category change test")

      attach_file("file-uploader", fixture_path, make_visible: true)
      expect(composer).to have_no_in_progress_uploads
      expect(composer.preview).to have_css(".image-wrapper")

      reply_field = find("textarea.d-editor-input", visible: :all)
      reply_before_category = reply_field.value

      composer.switch_category(matched_category.name)

      try_until_success(timeout: 10) do
        expect(find("textarea.d-editor-input", visible: :all).value).not_to eq(
          reply_before_category,
        )
      end

      reply_after_first_change = find("textarea.d-editor-input", visible: :all).value

      composer.switch_category(other_category.name)

      try_until_success(timeout: 10) do
        expect(find("textarea.d-editor-input", visible: :all).value).not_to eq(
          reply_after_first_change,
        )
      end

      composer.submit
      expect(page).to have_css(".fancy-title")

      # other_category matches no profile, so the second change should revert
      # the image back to its original (unwatermarked) bytes.
      upload = topic_page.current_topic.first_post.uploads.first
      original_sha1 = Digest::SHA1.file(fixture_path).hexdigest

      expect(upload.sha1).to eq(original_sha1)
    end
  end

  context "when tags change" do
    fab!(:tag) { Fabricate(:tag, name: "watermark-tag") }

    let(:mini_tag_chooser) { PageObjects::Components::SelectKit.new(".mini-tag-chooser") }

    before do
      SiteSetting.tagging_enabled = true
      SiteSetting.allow_uncategorized_topics = true

      theme.update_setting(
        :watermark_profiles,
        [
          {
            "name" => "tag profile",
            "enabled" => true,
            "tags" => [tag.name],
            "groups" => [5], # AUTO_GROUPS.logged_in_users
            "source" => "text",
            "text" => "WATERMARKED",
          },
        ],
      )
      theme.save!
    end

    it "re-watermarks an already-uploaded image once a matching tag is added" do
      sign_in(user)
      topic_page.open_new_topic
      composer.fill_title("Reprocess on tags change test")

      attach_file("file-uploader", fixture_path, make_visible: true)
      expect(composer).to have_no_in_progress_uploads
      expect(composer.preview).to have_css(".image-wrapper")

      reply_before_tag = find("textarea.d-editor-input", visible: :all).value

      mini_tag_chooser.expand
      mini_tag_chooser.search(tag.name)
      mini_tag_chooser.select_row_by_name(tag.name)
      mini_tag_chooser.collapse

      try_until_success(timeout: 10) do
        expect(find("textarea.d-editor-input", visible: :all).value).not_to eq(reply_before_tag)
      end

      composer.submit
      expect(page).to have_css(".fancy-title")

      upload = topic_page.current_topic.first_post.uploads.first
      original_sha1 = Digest::SHA1.file(fixture_path).hexdigest

      expect(upload.sha1).not_to eq(original_sha1)
    end
  end

  context "when switching composer actions" do
    fab!(:matched_category, :category)
    fab!(:other_category, :category)
    fab!(:third_category, :category)
    fab!(:topic) { Fabricate(:topic, category: other_category) }
    fab!(:post) { Fabricate(:post, topic: topic) }

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

    it "keeps tracking an uploaded image across a composer-actions switch" do
      sign_in(user)
      topic_page.visit_topic(topic)
      topic_page.click_reply_button

      composer.open_composer_actions
      composer.select_action_by_id("reply_as_new_topic")
      composer.fill_title("Reprocess survives action switch test")

      attach_file("file-uploader", fixture_path, make_visible: true)
      expect(composer).to have_no_in_progress_uploads
      expect(composer.preview).to have_css(".image-wrapper")

      reply_field = find("textarea.d-editor-input", visible: :all)
      reply_before_category = reply_field.value

      composer.switch_category(matched_category.name)

      try_until_success(timeout: 10) do
        expect(find("textarea.d-editor-input", visible: :all).value).not_to eq(
          reply_before_category,
        )
      end

      reply_after_first_change = find("textarea.d-editor-input", visible: :all).value

      composer.open_composer_actions
      composer.select_action_by_id("reply_to_topic")

      composer.open_composer_actions
      composer.select_action_by_id("reply_as_new_topic")

      composer.switch_category(third_category.name)

      try_until_success(timeout: 10) do
        expect(find("textarea.d-editor-input", visible: :all).value).not_to eq(
          reply_after_first_change,
        )
      end
    end
  end
end
