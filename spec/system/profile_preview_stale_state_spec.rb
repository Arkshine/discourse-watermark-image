# frozen_string_literal: true

RSpec.describe "Watermark - profile preview tabs stale state", system: true do
  let!(:theme) { upload_theme_component }
  fab!(:user, :admin)

  before { sign_in(user) }

  it "does not show preview tabs for an unsaved abandoned profile" do
    visit "/admin/customize/themes/#{theme.id}/schema/watermark_profiles"

    expect(page).to have_no_css(".watermark-schema-tabs-mount .watermark-tabs")

    find(".schema-setting-editor__tree-add-button.--root").click
    expect(page).to have_css(".watermark-schema-tabs-mount .watermark-tabs")

    find(".customize-show-schema__back").click
    expect(page).to have_current_path("/admin/customize/themes/#{theme.id}")

    find(".theme-setting[data-setting=\"watermark_profiles\"] .setting-value-edit-button").click
    expect(page).to have_current_path(
      "/admin/customize/themes/#{theme.id}/schema/watermark_profiles",
    )

    expect(page).to have_no_css(".watermark-schema-tabs-mount .watermark-tabs")
  end
end
