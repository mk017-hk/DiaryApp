import AVFoundation
import ExpoModulesCore

/**
 The sound from a recorded video, as an audio file.

 Speech recognition on iOS reads audio files, and the camera records movies.
 This copies a movie's audio track into an .m4a beside it, using the
 system's own exporter — nothing is re-encoded by hand and nothing leaves the
 phone. The caller deletes the copy once it has been transcribed.
 */
internal final class NoAudioTrackException: GenericException<String> {
  override var reason: String {
    "The recording has no sound to transcribe: '\(param)'"
  }
}

internal final class AudioExportFailedException: GenericException<String> {
  override var reason: String {
    "The sound could not be copied out of the recording: \(param)"
  }
}

public class AudioExtractModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioExtract")

    AsyncFunction("extractAudioAsync") { (sourceUri: URL, promise: Promise) in
      let asset = AVURLAsset(url: sourceUri)

      guard !asset.tracks(withMediaType: .audio).isEmpty else {
        promise.reject(NoAudioTrackException(sourceUri.lastPathComponent))
        return
      }

      guard let session = AVAssetExportSession(
        asset: asset,
        presetName: AVAssetExportPresetAppleM4A
      ) else {
        promise.reject(AudioExportFailedException("no exporter for this file"))
        return
      }

      let output = FileManager.default.temporaryDirectory
        .appendingPathComponent("transcribe-\(UUID().uuidString)")
        .appendingPathExtension("m4a")

      session.outputURL = output
      session.outputFileType = .m4a

      session.exportAsynchronously {
        switch session.status {
        case .completed:
          promise.resolve(output.absoluteString)
        default:
          promise.reject(
            AudioExportFailedException(session.error?.localizedDescription ?? "export did not finish")
          )
        }
      }
    }
  }
}
