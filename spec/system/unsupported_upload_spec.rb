# frozen_string_literal: true

RSpec.describe "Watermark - unsupported upload extension", system: true do
  let!(:theme) { upload_theme_component }
  fab!(:user, :admin)

  let(:topic_page) { PageObjects::Pages::Topic.new }
  let(:dialog) { PageObjects::Components::Dialog.new }

  before { SiteSetting.allow_uncategorized_topics = true }

  def attach_gif
    attach_file(
      "file-uploader",
      file_from_fixtures("animated.gif", "images").path,
      make_visible: true,
    )
  end

  context "when allow_non_supported_uploads is disabled" do
    it "blocks an image extension the watermark does not support" do
      sign_in(user)
      topic_page.open_new_topic

      attach_gif

      expect(dialog).to be_open
      expect(dialog).to have_content("doesn't support watermarking")
    end
  end

  context "when allow_non_supported_uploads is enabled" do
    before do
      theme.update_setting(:watermark_allow_non_supported_uploads, true)
      theme.save!
    end

    it "allows the upload through without a dialog" do
      sign_in(user)
      topic_page.open_new_topic

      attach_gif

      expect(dialog).to be_closed
    end
  end
end
