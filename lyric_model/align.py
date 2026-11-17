"""Offline known-lyrics alignment. No transcription service or runtime downloads.

Whisper attention + CTranslate2 DTW aligns the provided words to actual audio.
It does not generate timings by dividing an LRC line into equal intervals.
"""
import argparse,json,os,re,sys
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'
def emit(value):print(json.dumps(value,ensure_ascii=False),flush=True)
def language_for(text,detected):
    if re.search('[\u3040-\u30ff]',text):return 'ja'
    if re.search('[\uac00-\ud7af]',text):return 'ko'
    if re.search('[\u3400-\u9fff]',text):return 'zh'
    if re.search('[\u0400-\u04ff]',text):return 'ru'
    if re.search('[\u0600-\u06ff]',text):return 'ar'
    return detected
def run(model_path,request):
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio,pad_or_trim
    from faster_whisper.tokenizer import Tokenizer
    import numpy as np
    lines=request['lines'];audio_path=request['audio']
    if len(lines)>1000 or not os.path.isfile(audio_path):raise ValueError('Invalid lyric input')
    model=WhisperModel(model_path,device='cpu',compute_type='int8',cpu_threads=min(4,os.cpu_count() or 1),num_workers=1,local_files_only=True)
    audio=decode_audio(audio_path,sampling_rate=16000)
    if len(audio)>16000*21600:raise ValueError('Audio exceeds supported length')
    duration=len(audio)/16000
    index=max(0,min(len(lines)-1,int(request.get('index',0))))
    begin=int(max(0,lines[index]['time'])*16000)
    sample=audio[begin:begin+30*16000]
    detected='en'
    if len(sample)>1600:
        try:detected=model.detect_language(audio=sample)[0]
        except Exception:pass
    count=0;failed=0
    order=list(range(index,len(lines)))+list(range(index))
    for i in order:
        row=lines[i];text=str(row['text']);start=max(0,float(row['time'])-.25)
        end=min(duration,start+28,(float(lines[i+1]['time'])+.15) if i+1<len(lines) else duration)
        if row.get('words'):continue
        chunk=audio[int(start*16000):int(end*16000)]
        if len(chunk)<1600 or float(np.max(np.abs(chunk)))<.0001:failed+=1;continue
        try:
            tokenizer=Tokenizer(model.hf_tokenizer,True,task='transcribe',language=language_for(text,detected))
            # Force CJK character boundaries in the supplied tokens. Latin words
            # retain their ordinary tokenization; no equal-duration subdivision.
            pieces=re.findall(r'[\u3400-\u9fff\u3040-\u30ff]|[^\u3400-\u9fff\u3040-\u30ff]+',text)
            tokens=[token for piece in pieces for token in tokenizer.encode(piece)]
            if not tokens or len(tokens)>400:failed+=1;continue
            features=pad_or_trim(model.feature_extractor(chunk),3000,axis=-1)
            encoded=model.encode(features)
            alignment=model.find_alignment(tokenizer,[tokens],encoded,min(3000,len(chunk)//160))[0]
            words=[]
            for w in alignment:
                token={'text':w['word'],'time':round(start+min(end-start,max(0,float(w['start']))),3),'duration':round(max(0,min(end-start,float(w['end']))-min(end-start,max(0,float(w['start'])))),3)}
                if words and re.fullmatch(r'\s*[.,!?;:，。！？；：、]+',token['text']):words[-1]['text']+=token['text']
                else:words.append(token)
            if ''.join(w['text'] for w in words).strip()!=text.strip() or not any(w['duration']>.02 for w in words):failed+=1;continue
            emit({'type':'line','index':i,'words':words});count+=1
        except Exception:
            failed+=1
    emit({'type':'done','alignedCount':count,'failedCount':failed,'language':detected})
if __name__=='__main__':
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser();parser.add_argument('--model',required=True);args=parser.parse_args()
    try:
        source=sys.stdin.buffer.read(2*1024*1024+1)
        if len(source)>2*1024*1024:raise ValueError('Input too large')
        run(args.model,json.loads(source.decode('utf-8')))
    except Exception as error:
        if os.environ.get('MUSIC_LYRIC_MODEL_DEBUG')=='1':
            import traceback
            traceback.print_exc(file=sys.stderr)
        emit({'type':'error','message':type(error).__name__});sys.exit(1)
