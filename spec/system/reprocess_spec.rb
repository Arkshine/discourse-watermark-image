# frozen_string_literal: true

RSpec.describe "Watermark - reprocess", system: true do
  let!(:theme) { upload_theme_component }
  fab!(:user, :admin)

  let(:topic_page) { PageObjects::Pages::Topic.new }
  let(:composer) { PageObjects::Components::Composer.new }
  let(:fixture_path) { file_from_fixtures("logo.png", "images").path }

  def upload_and_wait
    attach_file("file-uploader", fixture_path, make_visible: true)
    # Watermarking runs in a worker before upload; slow CI can exceed the default 4s wait.
    try_until_success(timeout: 15) { expect(composer).to have_no_in_progress_uploads }
  end

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

      upload_and_wait
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

      upload_and_wait
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

      upload_and_wait
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

  context "when manually toggled" do
    fab!(:matched_category, :category)

    before do
      theme.update_setting(:watermark_manual_toggle_groups, "5") # AUTO_GROUPS.logged_in_users
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

    it "uploads without a watermark and lets the poster apply it" do
      sign_in(user)
      topic_page.open_new_topic
      composer.fill_title("Manual toggle test")
      composer.switch_category(matched_category.name)

      upload_and_wait
      expect(composer.preview).to have_css(".image-wrapper")

      toggle_button = find(".watermark-manual-toolbar__toggle")
      expect(toggle_button[:class]).to include("--removed")

      reply_before_toggle = find("textarea.d-editor-input", visible: :all).value
      toggle_button.click

      try_until_success(timeout: 10) do
        expect(find("textarea.d-editor-input", visible: :all).value).not_to eq(reply_before_toggle)
      end

      expect(find(".watermark-manual-toolbar__toggle")[:class]).to include("--applied")

      composer.submit
      expect(page).to have_css(".fancy-title")

      upload = topic_page.current_topic.first_post.uploads.first
      original_sha1 = Digest::SHA1.file(fixture_path).hexdigest

      expect(upload.sha1).not_to eq(original_sha1)
    end

    # Flaky test
    xit "lets the poster apply the watermark via the rich editor" do
      sign_in(user)
      topic_page.open_new_topic
      composer.fill_title("Manual toggle RTE test")
      composer.switch_category(matched_category.name)

      upload_and_wait

      composer.toggle_rich_editor
      expect(composer).to have_rich_editor_active

      composer.rich_editor.find(".composer-image-node img").click

      toggle_button = find(".watermark-manual-toolbar__toggle")
      expect(toggle_button[:class]).to include("--removed")
      toggle_button.click

      try_until_success(timeout: 10) { expect(toggle_button[:class]).to include("--applied") }

      composer.submit
      expect(page).to have_css(".fancy-title")

      upload = topic_page.current_topic.first_post.uploads.first
      original_sha1 = Digest::SHA1.file(fixture_path).hexdigest

      expect(upload.sha1).not_to eq(original_sha1)
    end
  end

  context "when several profiles match" do
    before do
      theme.update_setting(:watermark_manual_toggle_groups, "5") # AUTO_GROUPS.logged_in_users
      theme.update_setting(
        :watermark_profiles,
        [
          {
            "name" => "first",
            "enabled" => true,
            "groups" => [5],
            "source" => "text",
            "text" => "FIRST",
          },
          {
            "name" => "second",
            "enabled" => true,
            "groups" => [5],
            "source" => "text",
            "text" => "SECOND",
          },
        ],
      )
      theme.save!
    end

    it "lets the poster pick a matching profile from a menu" do
      sign_in(user)
      topic_page.open_new_topic
      composer.fill_title("Profile picker test")

      upload_and_wait
      expect(composer.preview).to have_css(".image-wrapper")

      reply_before_pick = find("textarea.d-editor-input", visible: :all).value

      find(".watermark-manual-toolbar__toggle").click
      menu = find(".fk-d-menu[data-identifier='watermark-profile-picker']")
      expect(menu).to have_css(".dropdown-menu__item", count: 4)
      expect(menu).to have_css(".is-selected", text: "No watermark")

      menu.find("button", text: "second").click

      try_until_success(timeout: 10) do
        expect(find("textarea.d-editor-input", visible: :all).value).not_to eq(reply_before_pick)
      end
      expect(composer).to have_no_in_progress_uploads

      find(".watermark-manual-toolbar__toggle").click
      expect(find(".fk-d-menu[data-identifier='watermark-profile-picker']")).to have_css(
        ".is-selected",
        text: "second",
      )
    end
  end

  context "when applying a picked profile to all images" do
    before do
      theme.update_setting(:watermark_manual_toggle_groups, "5") # AUTO_GROUPS.logged_in_users
      theme.update_setting(
        :watermark_profiles,
        [
          {
            "name" => "first",
            "enabled" => true,
            "groups" => [5],
            "source" => "text",
            "text" => "FIRST",
          },
          {
            "name" => "second",
            "enabled" => true,
            "groups" => [5],
            "source" => "text",
            "text" => "SECOND",
          },
        ],
      )
      theme.save!
    end

    it "re-watermarks every image with the picked profile" do
      sign_in(user)
      topic_page.open_new_topic
      composer.fill_title("Apply to all test")

      upload_and_wait
      upload_and_wait
      expect(composer.preview).to have_css(".image-wrapper", count: 2)

      urls_before =
        find("textarea.d-editor-input", visible: :all).value.scan(%r{\(upload://[^)]+\)})
      expect(urls_before.size).to eq(2)

      all(".watermark-manual-toolbar__toggle").first.click
      find(".fk-d-menu[data-identifier='watermark-profile-picker']").find(
        "button",
        text: "second",
      ).click

      try_until_success(timeout: 10) do
        expect(all(".watermark-manual-toolbar__toggle.--applied").size).to eq(1)
      end
      expect(composer).to have_no_in_progress_uploads

      all(".watermark-manual-toolbar__toggle").first.click
      find(".fk-d-menu[data-identifier='watermark-profile-picker']").find(
        "button",
        text: "Apply to all images",
      ).click

      try_until_success(timeout: 10) do
        expect(all(".watermark-manual-toolbar__toggle.--applied").size).to eq(2)
      end
      expect(composer).to have_no_in_progress_uploads

      urls_after = find("textarea.d-editor-input", visible: :all).value.scan(%r{\(upload://[^)]+\)})
      expect(urls_after.size).to eq(2)
      expect(urls_after[0]).not_to eq(urls_before[0])
      expect(urls_after[1]).not_to eq(urls_before[1])
    end
  end

  context "when a picked profile stops matching" do
    fab!(:matched_category, :category)
    fab!(:other_category, :category)

    before do
      theme.update_setting(:watermark_manual_toggle_groups, "5") # AUTO_GROUPS.logged_in_users
      theme.update_setting(
        :watermark_profiles,
        [
          {
            "name" => "everywhere",
            "enabled" => true,
            "groups" => [5],
            "source" => "text",
            "text" => "ALL",
          },
          {
            "name" => "category only",
            "enabled" => true,
            "categories" => [matched_category.id],
            "groups" => [5],
            "source" => "text",
            "text" => "CATEGORY",
          },
        ],
      )
      theme.save!
    end

    it "removes the watermark after a category change" do
      sign_in(user)
      topic_page.open_new_topic
      composer.fill_title("Pin reset test")
      composer.switch_category(matched_category.name)

      upload_and_wait
      expect(composer.preview).to have_css(".image-wrapper")

      find(".watermark-manual-toolbar__toggle").click
      find(".fk-d-menu[data-identifier='watermark-profile-picker']").find(
        "button",
        text: "category only",
      ).click

      try_until_success(timeout: 10) do
        expect(find(".watermark-manual-toolbar__toggle")[:class]).to include("--applied")
      end
      expect(composer).to have_no_in_progress_uploads
      url_pinned = find("textarea.d-editor-input", visible: :all).value[%r{\(upload://[^)]+\)}]

      composer.switch_category(other_category.name)

      try_until_success(timeout: 10) do
        expect(
          find("textarea.d-editor-input", visible: :all).value[%r{\(upload://[^)]+\)}],
        ).not_to eq(url_pinned)
      end
      expect(composer).to have_no_in_progress_uploads
      expect(find(".watermark-manual-toolbar__toggle")[:class]).to include("--removed")
    end
  end

  context "when the same image is uploaded twice" do
    fab!(:matched_category, :category)

    before do
      theme.update_setting(:watermark_manual_toggle_groups, "5") # AUTO_GROUPS.logged_in_users
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

    it "keeps the second occurrence toggleable after watermarking the first" do
      sign_in(user)
      topic_page.open_new_topic
      composer.fill_title("Duplicate image toggle test")
      composer.switch_category(matched_category.name)

      upload_and_wait
      upload_and_wait

      expect(composer.preview).to have_css(".image-wrapper", count: 2)
      expect(page).to have_css(".watermark-manual-toolbar__toggle", count: 2)

      reply_before_toggle = find("textarea.d-editor-input", visible: :all).value
      all(".watermark-manual-toolbar__toggle").first.click

      try_until_success(timeout: 10) do
        expect(find("textarea.d-editor-input", visible: :all).value).not_to eq(reply_before_toggle)
      end

      expect(page).to have_css(".watermark-manual-toolbar__toggle", count: 2)

      second_toggle = all(".watermark-manual-toolbar__toggle").last
      expect(second_toggle[:class]).not_to include("--unavailable")
      expect(second_toggle[:disabled]).not_to eq(true)
    end

    it "only swaps the occurrence that was toggled, leaving the other untouched" do
      sign_in(user)
      topic_page.open_new_topic
      composer.fill_title("Duplicate image toggle identity test")
      composer.switch_category(matched_category.name)

      upload_and_wait
      upload_and_wait

      expect(composer.preview).to have_css(".image-wrapper", count: 2)
      expect(page).to have_css(".watermark-manual-toolbar__toggle", count: 2)

      reply_before_toggle = find("textarea.d-editor-input", visible: :all).value
      urls_before = reply_before_toggle.scan(%r{\(upload://[^)]+\)})
      expect(urls_before.size).to eq(2)

      all(".watermark-manual-toolbar__toggle").last.click

      try_until_success(timeout: 10) do
        expect(find("textarea.d-editor-input", visible: :all).value).not_to eq(reply_before_toggle)
      end

      reply_after_toggle = find("textarea.d-editor-input", visible: :all).value
      urls_after = reply_after_toggle.scan(%r{\(upload://[^)]+\)})
      expect(urls_after.size).to eq(2)

      expect(urls_after[0]).to eq(urls_before[0])
      expect(urls_after[1]).not_to eq(urls_before[1])
    end
  end

  context "when the composer restores a draft from a previous session" do
    fab!(:matched_category, :category)

    before do
      theme.update_setting(:watermark_manual_toggle_groups, "5") # AUTO_GROUPS.logged_in_users
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

    it "shows the toggle disabled instead of not appearing at all" do
      sign_in(user)
      topic_page.open_new_topic
      composer.fill_title("Restored draft test")
      composer.switch_category(matched_category.name)

      upload_and_wait
      expect(composer.preview).to have_css(".image-wrapper")

      try_until_success(reason: "Relies on an Ember debounce to update the draft") do
        expect(Draft.where(user: user).count).to eq(1)
      end

      composer.close

      drafts_dropdown = PageObjects::Components::DraftsMenu.new
      visit "/"
      drafts_dropdown.open
      find(".topic-drafts-item").click

      expect(composer).to be_opened
      expect(composer.preview).to have_css(".image-wrapper")

      toggle_button = find(".watermark-manual-toolbar__toggle")
      expect(toggle_button[:disabled]).to eq(true)
      expect(toggle_button[:class]).to include("--unavailable")
    end
  end
end
