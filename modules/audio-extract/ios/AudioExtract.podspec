Pod::Spec.new do |s|
  s.name           = 'AudioExtract'
  s.version        = '1.0.0'
  s.summary        = 'Copies the sound out of a recorded video into an audio file.'
  s.description    = 'Copies the sound out of a recorded video into an audio file, on the phone, so it can be transcribed.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { :type => 'Private' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.4'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,swift}"
end
