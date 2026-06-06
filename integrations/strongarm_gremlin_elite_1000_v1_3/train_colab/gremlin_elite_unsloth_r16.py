"""
Gremlin Elite 1000 — Unsloth SFT scaffold.

Use on Colab/RunPod.
This trains packet behavior, not a final-answer chatbot.

Recommended first run:
  base: Qwen3-4B Unsloth 4-bit variant
  r: 16
  epochs: 1
Then compare:
  epochs: 2
"""

import json
from datasets import load_dataset
from unsloth import FastLanguageModel
from trl import SFTTrainer, SFTConfig

MODEL_NAME = "unsloth/Qwen3-4B-unsloth-bnb-4bit"
MAX_SEQ_LENGTH = 4096
OUTPUT_DIR = "outputs/gremlin-elite-qwen3-4b-r16"

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=MODEL_NAME,
    max_seq_length=MAX_SEQ_LENGTH,
    dtype=None,
    load_in_4bit=True,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"],
    lora_alpha=32,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=5528,
)

def format_row(example):
    messages = example["messages"]
    completion = example["completion"]
    text = tokenizer.apply_chat_template(
        messages + [{"role": "assistant", "content": json.dumps(completion, ensure_ascii=False)}],
        tokenize=False,
        add_generation_prompt=False,
    )
    return {"text": text}

dataset = load_dataset("json", data_files={
    "train": "data/train.jsonl",
    "validation": "data/val.jsonl",
})
dataset = dataset.map(format_row)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset["train"],
    eval_dataset=dataset["validation"],
    args=SFTConfig(
        output_dir=OUTPUT_DIR,
        dataset_text_field="text",
        max_seq_length=MAX_SEQ_LENGTH,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=8,
        warmup_steps=10,
        num_train_epochs=1,  # run 1 first; compare against 2
        learning_rate=2e-4,
        logging_steps=5,
        eval_steps=25,
        save_steps=50,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="linear",
        seed=5528,
        report_to="none",
    ),
)

trainer.train()
model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)
