import { AudioDecodeProcessor } from "./artifact_manifest";
import { ChatCompletionAudioInput } from "./openai_api_protocols";
export declare function resampleLinear(samples: Float32Array, sourceRate: number, targetRate: number): Float32Array;
export declare function decodeAudioInput(input: ChatCompletionAudioInput, processor: AudioDecodeProcessor): Float32Array;
//# sourceMappingURL=audio.d.ts.map