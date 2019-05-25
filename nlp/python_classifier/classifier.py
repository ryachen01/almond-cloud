try:
    from keras.models import load_model
    # Import BERT Embedding from PyPi
    from bert_embedding import BertEmbedding
    import numpy, math, sys, json
    bert_embedding = BertEmbedding()
    model = load_model("python_classifier/classifier.h5")
except:
    print("couldn't import modules")

def encode_sentence(sentence):

    # Takes input of list of sentences and returns numpy array of length 20 with the BERT Embedding

    encoded_sentence = numpy.zeros(15360)

    result = bert_embedding([sentence])
    index = 0
    for j in range(len(result[0][1])):
        if j < 20:
            for k in range(len(result[0][1][j])):

                encoded_sentence[index] = result[0][1][j][k]
                index += 1

    return encoded_sentence


def output_prediction(sentence):

    if sentence != None:

        encoded = encode_sentence(sentence)

        test_data = numpy.zeros([1, 15360])
        test_data[0] = encoded

        percentages = model.predict(test_data)

        total = 0

        adjusted_percentages = []
        for i in range(4):

            adjustedValue = math.sqrt(percentages[0][i])
            adjusted_percentages.append(adjustedValue)
            total = total + adjustedValue

        final_percentages = []
        for j in range(4):
            final_percentages.append(adjusted_percentages[j] / total)

        return final_percentages
    else:
        return (0.25, 0.25, 0.25, 0.25)


def main():

    # print probabilities based on user input

    try:

        while True:
            line = sys.stdin.readline()

            if not line:
                break

            inputs = json.loads(line)

            unique_id = inputs['id']
            sentence = inputs['sentence']

            probabilities = output_prediction(sentence)
            class_probabilities = {
                "questions": str(probabilities[0]),
                "commands": str(probabilities[1]),
                "chatty": str(probabilities[2]),
                "other": str(probabilities[3]),
                "sentence": str(sentence),
                "id": str(unique_id)
            }

            sys.stdout.write(str(json.dumps(class_probabilities)))
            sys.stdout.flush()

    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

